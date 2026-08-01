// 文件树视图：展示工作副本的完整目录结构（懒加载，展开时才列目录），
// 并把 svn status 叠加上去——有改动的文件带状态角标（M/A/D/?/!/C 等），
// 目录带「内部改动数」角标；已删除/丢失（D/!）的文件磁盘上不存在，
// 以虚拟节点补进树里。点击带状态的文件联动差异面板。

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Dropdown, Empty, Spin, Tag, Tree } from "antd";
import type { DataNode } from "antd/es/tree";
import { DownOutlined, FileOutlined, FolderOutlined } from "@ant-design/icons";
import { useAppStore } from "../stores/appStore";
import * as svnApi from "../api/svn";
import { BlameModal } from "./BlameModal";
import { fileMenuItems, useFileActions } from "./fileActions";
import type { FsEntry, StatusEntry, StatusKind } from "../types";

// 状态码 → 角标
const STATUS_TAG: Record<StatusKind, { label: string; color: string }> = {
  modified: { label: "M", color: "orange" },
  added: { label: "A", color: "green" },
  deleted: { label: "D", color: "red" },
  unversioned: { label: "?", color: "default" },
  missing: { label: "!", color: "volcano" },
  conflicted: { label: "C", color: "magenta" },
  ignored: { label: "I", color: "default" },
  replaced: { label: "R", color: "purple" },
  external: { label: "X", color: "blue" },
  incomplete: { label: "~", color: "gold" },
  normal: { label: "", color: "default" },
  none: { label: "", color: "default" },
};

/** 计入目录改动数角标的状态（与 WorkingCopyView 的 CHANGED 口径一致） */
const CHANGED = new Set<StatusKind>([
  "modified",
  "added",
  "deleted",
  "replaced",
  "unversioned",
  "conflicted",
  "missing",
]);

interface TreeNode extends DataNode {
  key: string;
  title: React.ReactNode;
  children?: TreeNode[];
  isLeaf: boolean;
  /** 关联的 status entry（有状态的节点才有） */
  entry?: StatusEntry;
}

function parentOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

function baseName(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function nodeTitle(name: string, isDir: boolean, entry?: StatusEntry, changedCount?: number): React.ReactNode {
  const tag = entry ? STATUS_TAG[entry.itemStatus] : undefined;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {tag?.label && (
        <Tag
          color={tag.color}
          style={{ fontFamily: "monospace", margin: 0, minWidth: 18, textAlign: "center" }}
        >
          {tag.label}
        </Tag>
      )}
      <span style={isDir ? { fontWeight: 500 } : undefined}>{name}</span>
      {isDir && (changedCount ?? 0) > 0 && (
        <Badge
          count={changedCount}
          size="small"
          style={{ backgroundColor: "#fa8c16" }}
          title={`${changedCount} 个改动`}
        />
      )}
    </span>
  );
}

export function FileTreeView({ wcPath, entries }: { wcPath: string; entries: StatusEntry[] }) {
  const selectFile = useAppStore((s) => s.selectFile);

  // 已加载的目录列表缓存：相对路径 → 直接子项（"" = 工作副本根）
  const [loaded, setLoaded] = useState<Map<string, FsEntry[]>>(new Map());
  // 树的选中项由组件自己管理：点什么高亮什么，diff 联动只是附带效果
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  // 右键菜单：出现位置 + 目标条目（未改动节点合成 normal 条目）+ 是否目录
  const [ctx, setCtx] = useState<{ x: number; y: number; entry: StatusEntry; isDir: boolean } | null>(null);
  const { runAction, blameFile, closeBlame } = useFileActions(wcPath);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const prevWcRef = useRef<string | null>(null);

  // 受控 Dropdown（trigger=[]）不会自己监听外部点击：
  // 菜单打开期间，按下鼠标在菜单区域外、或按 Esc，即关闭。
  useEffect(() => {
    if (!ctx) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      const inAnchor = menuWrapRef.current?.contains(target) ?? false;
      const inOverlay = (target as HTMLElement).closest?.(".ant-dropdown") != null;
      if (!inAnchor && !inOverlay) setCtx(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setCtx(null);
    }
    // 捕获阶段监听，保证先于树节点自身的事件处理
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [ctx]);

  // 初次挂载 / 切换工作副本：只加载根目录；
  // status 变化（刷新、文件监控）：重新拉取所有已展开过的目录，保持列表与磁盘同步。
  useEffect(() => {
    const isSwitch = prevWcRef.current !== wcPath;
    prevWcRef.current = wcPath;
    if (isSwitch) {
      setSelectedKeys([]);
      setCtx(null);
    }
    const keys = isSwitch || loadedRef.current.size === 0 ? [""] : [...loadedRef.current.keys()];
    let cancelled = false;
    void Promise.all(
      keys.map((k) =>
        svnApi
          .listDir(wcPath, k)
          .then((items) => [k, items] as const)
          // 目录可能已被删除等，静默丢弃即可
          .catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      setLoaded(new Map(results.filter((r): r is readonly [string, FsEntry[]] => r !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, [wcPath, entries]);

  // status 索引：路径 → entry；父目录 → 子 entry 列表；目录 → 内部改动数
  const { statusMap, statusByParent, changedCountByDir } = useMemo(() => {
    const statusMap = new Map<string, StatusEntry>();
    const statusByParent = new Map<string, StatusEntry[]>();
    const changedCountByDir = new Map<string, number>();
    for (const e of entries) {
      // 工作副本根目录自身的条目（如根目录属性改动），不作为树节点
      if (e.path === "." || e.path === "") continue;
      statusMap.set(e.path, e);
      const parent = parentOf(e.path);
      const list = statusByParent.get(parent);
      if (list) list.push(e);
      else statusByParent.set(parent, [e]);
      if (CHANGED.has(e.itemStatus)) {
        // 给每一级祖先目录累加改动数
        let p = parentOf(e.path);
        for (;;) {
          changedCountByDir.set(p, (changedCountByDir.get(p) ?? 0) + 1);
          if (p === "") break;
          p = parentOf(p);
        }
      }
    }
    return { statusMap, statusByParent, changedCountByDir };
  }, [entries]);

  const treeData = useMemo(() => {
    // 磁盘上不存在、纯靠 status 撑起来的虚拟子树（整目录被 svn delete 的场景）
    const buildVirtual = (dirPath: string): TreeNode[] =>
      (statusByParent.get(dirPath) ?? []).map((e) => {
        const hasChildren = statusByParent.has(e.path);
        return {
          key: e.path,
          title: nodeTitle(baseName(e.path), hasChildren, e, changedCountByDir.get(e.path)),
          isLeaf: !hasChildren,
          icon: hasChildren ? <FolderOutlined /> : <FileOutlined />,
          children: hasChildren ? buildVirtual(e.path) : undefined,
          entry: e,
        };
      });

    // 已加载目录 → 节点列表；未加载的目录 children 留空，交给 loadData 懒加载
    const buildDir = (dirPath: string): TreeNode[] | undefined => {
      const items = loaded.get(dirPath);
      if (!items) return undefined;

      const onDisk = new Set(items.map((i) => i.name));
      const nodes: TreeNode[] = items.map((item) => {
        const rel = dirPath ? `${dirPath}/${item.name}` : item.name;
        const entry = statusMap.get(rel);
        if (item.isDir) {
          return {
            key: rel,
            title: nodeTitle(item.name, true, entry, changedCountByDir.get(rel)),
            isLeaf: false,
            icon: <FolderOutlined />,
            children: buildDir(rel),
            entry,
          };
        }
        return {
          key: rel,
          title: nodeTitle(item.name, false, entry),
          isLeaf: true,
          icon: <FileOutlined />,
          entry,
        };
      });

      // 补上磁盘上已不存在但 status 里有的条目（D 已删除 / ! 丢失）
      for (const e of statusByParent.get(dirPath) ?? []) {
        const name = baseName(e.path);
        if (onDisk.has(name)) continue;
        const hasChildren = statusByParent.has(e.path);
        nodes.push({
          key: e.path,
          title: nodeTitle(name, hasChildren, e, changedCountByDir.get(e.path)),
          isLeaf: !hasChildren,
          icon: hasChildren ? <FolderOutlined /> : <FileOutlined />,
          children: hasChildren ? buildVirtual(e.path) : undefined,
          entry: e,
        });
      }
      return nodes;
    };

    return buildDir("") ?? [];
  }, [loaded, statusMap, statusByParent, changedCountByDir]);

  if (!loaded.has("")) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 48 }}>
        <Spin />
      </div>
    );
  }

  if (treeData.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 48 }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="目录为空" />
      </div>
    );
  }

  return (
    <>
      <div style={{ height: "100%", overflow: "auto", padding: "4px 8px" }}>
        <Tree
          // 切换工作副本时重挂载，重置 antd 内部的展开/已加载状态
          key={wcPath}
          treeData={treeData}
          loadData={async (node) => {
            const rel = String(node.key);
            if (loadedRef.current.has(rel)) return;
            try {
              const items = await svnApi.listDir(wcPath, rel);
              setLoaded((prev) => new Map(prev).set(rel, items));
            } catch {
              // 虚拟节点（已删除目录）或读取失败：children 已由 status 撑起或保持为空
            }
          }}
          selectedKeys={selectedKeys}
          onSelect={(keys, info) => {
            setSelectedKeys(keys);
            const node = info.node as unknown as TreeNode;
            // 带状态的文件 → 联动差异面板；目录或未改动文件 → 清空差异面板
            selectFile(info.selected && node.entry && node.isLeaf ? node.entry : null);
          }}
          onRightClick={({ event, node }) => {
            event.preventDefault();
            const n = node as unknown as TreeNode;
            // 右键同时选中该节点（只高亮，不动差异面板）
            setSelectedKeys([n.key]);
            // 未改动的节点没有 status entry，合成一个 normal 条目供菜单/动作使用
            const entry: StatusEntry = n.entry ?? {
              path: n.key,
              itemStatus: "normal",
              propStatus: "none",
              versioned: true,
              remoteChanged: false,
              copied: false,
              revision: null,
            };
            setCtx({ x: event.clientX, y: event.clientY, entry, isDir: !n.isLeaf });
          }}
          showIcon
          switcherIcon={<DownOutlined />}
          blockNode
        />
      </div>
      {/* 右键菜单：固定定位锚点 + 受控 Dropdown（外部点击/Esc 由上方 effect 关闭），
          菜单项与动作和列表视图共用 fileActions */}
      {ctx && (
        <div
          ref={menuWrapRef}
          style={{ position: "fixed", left: ctx.x, top: ctx.y, zIndex: 1000 }}
        >
          <Dropdown
            open
            trigger={[]}
            onOpenChange={(o) => {
              if (!o) setCtx(null);
            }}
            menu={{
              items: fileMenuItems(ctx.entry, { isDir: ctx.isDir }),
              onClick: ({ key }) => {
                const entry = ctx.entry;
                setCtx(null);
                void runAction(key, entry);
              },
            }}
          >
            <span />
          </Dropdown>
        </div>
      )}
      {blameFile && (
        <BlameModal open wcPath={wcPath} file={blameFile} onClose={closeBlame} />
      )}
    </>
  );
}
