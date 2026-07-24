import { useMemo } from "react";
import { Table, Tag, Empty } from "antd";
import type { ColumnsType } from "antd/es/table";
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

function StatusTag({ kind }: { kind: StatusKind }) {
  const meta = STATUS_META[kind];
  if (!meta.label) return <span style={{ color: "var(--text-secondary)" }}>—</span>;
  return (
    <Tag color={meta.color} style={{ fontFamily: "monospace", marginInlineEnd: 0 }}>
      {meta.label}
    </Tag>
  );
}

export function FileStatusTable({ entries }: { entries: StatusEntry[] }) {
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

  if (entries.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 48 }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有改动，工作副本是干净的" />
      </div>
    );
  }

  return (
    <Table<StatusEntry>
      rowKey="path"
      size="small"
      columns={columns}
      dataSource={entries}
      pagination={false}
      scroll={{ y: "100%" }}
      style={{ height: "100%" }}
    />
  );
}
