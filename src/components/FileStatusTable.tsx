// 文件状态表：状态角标 + 行点击联动差异面板 + 右键菜单（添加/还原/删除）。

import { useMemo, useState } from "react";
import { Dropdown, Empty, Modal, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { MenuProps } from "antd";
import {
  DiffOutlined,
  PlusOutlined,
  RollbackOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useAppStore } from "../stores/appStore";
import * as svnApi from "../api/svn";
import { showSvnError } from "../utils/errorDialog";
import type { StatusEntry, StatusKind } from "../types";

// 状态码 → 显示标签（字符 + 颜色 + 含义），参考 SmartSVN / TortoiseSVN 约定。
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

/** 可「还原」的状态 */
const REVERTABLE = new Set(["modified", "added", "deleted", "replaced", "missing", "conflicted"]);

function StatusTag({ kind }: { kind: StatusKind }) {
  const meta = STATUS_META[kind];
  if (!meta.label) return <span style={{ color: "var(--text-secondary)" }}>—</span>;
  return (
    <Tag color={meta.color} style={{ fontFamily: "monospace", marginInlineEnd: 0 }} title={meta.text}>
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
  const refreshStatus = useAppStore((s) => s.refreshStatus);
  const selectedId = useAppStore((s) => s.selectedId);
  const workingCopies = useAppStore((s) => s.workingCopies);
  const wcPath = workingCopies.find((w) => w.id === selectedId)?.path ?? null;

  const [ctx, setCtx] = useState<CtxMenu | null>(null);

  const columns = useMemo<ColumnsType<StatusEntry>>(
    () => [
      {
        title: "状态",
        dataIndex: "itemStatus",
        width: 64,
        align: "center",
        render: (kind: StatusKind) => <StatusTag kind={kind} />,
        sorter: (a, b) => a.itemStatus.localeCompare(b.itemStatus),
      },
      {
        title: "路径",
        dataIndex: "path",
        ellipsis: true,
        render: (path: string, row) => (
          <span title={path}>
            {path}
            {row.propStatus === "modified" && (
              <Tag color="cyan" style={{ marginLeft: 6 }}>
                属性
              </Tag>
            )}
          </span>
        ),
        sorter: (a, b) => a.path.localeCompare(b.path),
        defaultSortOrder: "ascend",
      },
      {
        title: "修订",
        dataIndex: "revision",
        width: 80,
        align: "right",
        render: (rev: number | null) => (rev == null ? "—" : rev),
      },
    ],
    [],
  );

  /** 右键菜单项按文件状态动态生成 */
  function menuItems(entry: StatusEntry): MenuProps["items"] {
    const items: MenuProps["items"] = [
      { key: "diff", label: "显示差异", icon: <DiffOutlined /> },
    ];
    if (entry.itemStatus === "unversioned") {
      items.push({ key: "add", label: "加入版本控制", icon: <PlusOutlined /> });
    }
    if (REVERTABLE.has(entry.itemStatus)) {
      items.push({ key: "revert", label: "还原改动", icon: <RollbackOutlined /> });
    }
    items.push({ type: "divider" });
    items.push({ key: "delete", label: "删除", icon: <DeleteOutlined />, danger: true });
    return items;
  }

  async function runAction(key: string, entry: StatusEntry) {
    if (!wcPath) return;
    try {
      if (key === "diff") {
        selectFile(entry);
      } else if (key === "add") {
        await svnApi.addFiles(wcPath, [entry.path]);
        message.success(`已加入版本控制：${entry.path}`);
        await refreshStatus();
      } else if (key === "revert") {
        Modal.confirm({
          title: "还原改动？",
          content: `将丢弃 ${entry.path} 的本地改动，且不可恢复。`,
          okText: "还原",
          okButtonProps: { danger: true },
          cancelText: "取消",
          async onOk() {
            try {
              await svnApi.revertFiles(wcPath, [entry.path]);
              message.success(`已还原：${entry.path}`);
              await refreshStatus();
            } catch (e) {
              showSvnError(e, "还原失败");
            }
          },
        });
      } else if (key === "delete") {
        const unversioned = entry.itemStatus === "unversioned";
        Modal.confirm({
          title: "删除文件？",
          content: unversioned
            ? `${entry.path} 未受版本控制，将直接从磁盘删除，不可恢复。`
            : `${entry.path} 将被 svn delete（本地立即删除，提交后从仓库移除）。`,
          okText: "删除",
          okButtonProps: { danger: true },
          cancelText: "取消",
          async onOk() {
            try {
              await svnApi.deleteFiles(
                wcPath,
                unversioned ? [] : [entry.path],
                unversioned ? [entry.path] : [],
              );
              message.success(`已删除：${entry.path}`);
              await refreshStatus();
            } catch (e) {
              showSvnError(e, "删除失败");
            }
          },
        });
      }
    } catch (e) {
      showSvnError(e);
    }
  }

  if (entries.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 48 }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有改动，工作副本是干净的" />
      </div>
    );
  }

  return (
    <>
      <Table<StatusEntry>
        rowKey="path"
        size="small"
        columns={columns}
        dataSource={entries}
        pagination={false}
        scroll={{ y: "100%" }}
        style={{ height: "100%" }}
        rowClassName={(row) => (row.path === selectedFile?.path ? "row-selected" : "")}
        onRow={(record) => ({
          onClick: () => selectFile(record),
          onContextMenu: (e) => {
            e.preventDefault();
            setCtx({ x: e.clientX, y: e.clientY, entry: record });
          },
        })}
      />
      {/* 右键菜单：固定定位锚点 + 受控 Dropdown */}
      {ctx && (
        <div style={{ position: "fixed", left: ctx.x, top: ctx.y, zIndex: 1000 }}>
          <Dropdown
            open
            trigger={[]}
            onOpenChange={(o) => {
              if (!o) setCtx(null);
            }}
            menu={{
              items: menuItems(ctx.entry),
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
    </>
  );
}
