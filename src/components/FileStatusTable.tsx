// 文件状态表：状态角标 + 行点击联动差异面板 + 右键菜单（添加/还原/删除）。
// 大工作副本下用 antd 虚拟滚动，只渲染可视行，避免 DOM 爆炸。

import { useEffect, useMemo, useRef, useState } from "react";
import { Dropdown, Empty, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useAppStore } from "../stores/appStore";
import { BlameModal } from "./BlameModal";
import { fileMenuItems, useFileActions } from "./fileActions";
import { t } from "../i18n";
import type { StatusEntry, StatusKind } from "../types";

/** 状态码 → 显示标签（字符 + 颜色 + 含义），参考 SmartSVN / TortoiseSVN 约定。 */
const STATUS_META: Record<StatusKind, { label: string; color: string; text: string }> = {
  modified: { label: "M", color: "orange", text: "已修改" },
  added: { label: "A", color: "green", text: "已添加" },
  deleted: { label: "D", color: "red", text: "已删除" },
  unversioned: { label: "?", color: "default", text: "未版本化" },
  missing: { label: "!", color: "volcano", text: "丢失" },
  conflicted: { label: "C", color: "magenta", text: "冲突" },
  ignored: { label: "I", color: "default", text: "已忽略" },
  replaced: { label: "R", color: "purple", text: "已替换" },
  external: { label: "X", color: "blue", text: "外部引用" },
  incomplete: { label: "~", color: "gold", text: "不完整" },
  normal: { label: "", color: "default", text: "正常" },
  none: { label: "", color: "default", text: "-" },
};

function StatusTag({ kind }: { kind: StatusKind }) {
  const meta = STATUS_META[kind];
  if (!meta.label) return <span style={{ color: "var(--text-secondary)" }}>—</span>;
  return (
    <Tag color={meta.color} style={{ fontFamily: "monospace", marginInlineEnd: 0 }} title={t(meta.text)}>
      {meta.label}
    </Tag>
  );
}

interface CtxMenu {
  x: number;
  y: number;
  entry: StatusEntry;
}

export function FileStatusTable({ entries }: { entries: StatusEntry[] }) {
  const selectedFile = useAppStore((s) => s.selectedFile);
  const selectFile = useAppStore((s) => s.selectFile);
  const selectedId = useAppStore((s) => s.selectedId);
  const workingCopies = useAppStore((s) => s.workingCopies);
  const wcPath = workingCopies.find((w) => w.id === selectedId)?.path ?? null;

  const [ctx, setCtx] = useState<CtxMenu | null>(null);
  const { runAction, blameFile, closeBlame } = useFileActions(wcPath);
  const menuWrapRef = useRef<HTMLDivElement>(null);

  // 虚拟滚动需要数字高/宽：用 ResizeObserver 测容器实际尺寸，喂给 Table 的 scroll。
  const containerRef = useRef<HTMLDivElement>(null);
  const [tableHeight, setTableHeight] = useState(400);
  const [containerWidth, setContainerWidth] = useState(600);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((obsEntries) => {
      const rect = obsEntries[0]?.contentRect;
      if (!rect) return;
      // 减去表头高度（约 39px），留给表体
      if (rect.height) setTableHeight(Math.max(0, rect.height - 39));
      if (rect.width) setContainerWidth(rect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 路径列宽 = 容器宽 - 状态列64 - 修订列80 - 滚动条约16，最小 160
  const pathWidth = Math.max(containerWidth - 64 - 80 - 16, 160);

  // 受控 Dropdown（trigger=[]）不会自己监听外部点击：
  // 菜单打开期间，按下鼠标在菜单区域外、或按 Esc，即关闭。
  useEffect(() => {
    if (!ctx) return;
    function onMouseDown(e: MouseEvent) {
      // 菜单浮层挂在 body 下的 .ant-dropdown 里，锚点在 menuWrapRef
      const target = e.target as Node;
      const inAnchor = menuWrapRef.current?.contains(target) ?? false;
      const inOverlay = (target as HTMLElement).closest?.(".ant-dropdown") != null;
      if (!inAnchor && !inOverlay) setCtx(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setCtx(null);
    }
    // 捕获阶段监听，保证先于表格行的 onClick/onContextMenu 处理
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [ctx]);

  const columns = useMemo<ColumnsType<StatusEntry>>(
    () => [
      {
        title: t("状态"),
        dataIndex: "itemStatus",
        width: 64,
        align: "center",
        render: (kind: StatusKind) => <StatusTag kind={kind} />,
        sorter: (a, b) => a.itemStatus.localeCompare(b.itemStatus),
      },
      {
        title: t("路径"),
        dataIndex: "path",
        width: pathWidth,
        ellipsis: true,
        render: (path: string, row) => (
          <span title={path}>
            {path}
            {row.propStatus === "modified" && (
              <Tag color="cyan" style={{ marginLeft: 6 }}>
                {t("属性")}
              </Tag>
            )}
          </span>
        ),
        sorter: (a, b) => a.path.localeCompare(b.path),
        defaultSortOrder: "ascend",
      },
      {
        title: t("修订"),
        dataIndex: "revision",
        width: 80,
        align: "right",
        render: (rev: number | null) => (rev == null ? "—" : rev),
      },
    ],
    [pathWidth],
  );

  /** 右键菜单项与动作执行统一由 fileActions 提供（与树视图共用） */

  if (entries.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 48 }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("没有改动，工作副本是干净的")} />
      </div>
    );
  }

  return (
    <>
      {/* 虚拟滚动容器：ResizeObserver 量它的高/宽，喂给 Table 的 scroll */}
      <div ref={containerRef} style={{ height: "100%", width: "100%", overflow: "hidden" }}>
        <Table<StatusEntry>
          rowKey="path"
          size="small"
          virtual
          columns={columns}
          dataSource={entries}
          pagination={false}
          scroll={{ y: tableHeight, x: containerWidth }}
          rowClassName={(row) => (row.path === selectedFile?.path ? "row-selected" : "")}
          onRow={(record) => ({
            onClick: () => selectFile(record),
            onContextMenu: (e) => {
              e.preventDefault();
              setCtx({ x: e.clientX, y: e.clientY, entry: record });
            },
          })}
        />
      </div>
      {/* 右键菜单：固定定位锚点 + 受控 Dropdown（外部点击/Esc 由上方 effect 关闭） */}
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
              items: fileMenuItems(ctx.entry),
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
      {blameFile && wcPath && (
        <BlameModal
          open
          wcPath={wcPath}
          file={blameFile}
          onClose={closeBlame}
        />
      )}
    </>
  );
}
