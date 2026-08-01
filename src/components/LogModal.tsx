// 日志视图：分页加载修订历史，展开行显示变更路径。

import { useCallback, useEffect, useState } from "react";
import { Button, Modal, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useAppStore } from "../stores/appStore";
import * as svnApi from "../api/svn";
import { showSvnError } from "../utils/errorDialog";
import { t } from "../i18n";
import type { LogEntry } from "../types";

const { Text } = Typography;

const PAGE_SIZE = 50;

const ACTION_COLOR: Record<string, string> = {
  A: "green",
  M: "orange",
  D: "red",
  R: "purple",
};

export function LogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const selectedId = useAppStore((s) => s.selectedId);
  const workingCopies = useAppStore((s) => s.workingCopies);
  const wcPath = workingCopies.find((w) => w.id === selectedId)?.path ?? null;

  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (beforeRev?: number) => {
      if (!wcPath) return;
      setLoading(true);
      try {
        const page = await svnApi.getLog(wcPath, PAGE_SIZE, beforeRev);
        setEntries((prev) => (beforeRev == null ? page : [...prev, ...page]));
        const last = page[page.length - 1];
        setHasMore(page.length === PAGE_SIZE && (last?.revision ?? 1) > 1);
      } catch (e) {
        showSvnError(e, t("读取日志失败"));
      } finally {
        setLoading(false);
      }
    },
    [wcPath],
  );

  // 打开时加载第一页
  useEffect(() => {
    if (open) {
      setEntries([]);
      void load();
    }
  }, [open, load]);

  function loadMore() {
    const last = entries[entries.length - 1];
    if (last && last.revision > 1) {
      void load(last.revision - 1);
    }
  }

  const columns: ColumnsType<LogEntry> = [
    {
      title: t("修订"),
      dataIndex: "revision",
      width: 80,
      render: (r: number) => <Text code>r{r}</Text>,
    },
    { title: t("作者"), dataIndex: "author", width: 120, ellipsis: true },
    {
      title: t("日期"),
      dataIndex: "date",
      width: 150,
      render: (d: string) => (d ? dayjs(d).format("YYYY-MM-DD HH:mm") : "—"),
    },
    { title: t("提交信息"), dataIndex: "message", ellipsis: true },
  ];

  return (
    <Modal
      title={t("提交日志")}
      open={open}
      onCancel={onClose}
      footer={
        <Space>
          {hasMore && (
            <Button onClick={loadMore} loading={loading}>
              {t("加载更多")}
            </Button>
          )}
          <Button type="primary" onClick={onClose}>
            {t("关闭")}
          </Button>
        </Space>
      }
      width={860}
      destroyOnClose
    >
      <Table<LogEntry>
        rowKey="revision"
        size="small"
        columns={columns}
        dataSource={entries}
        loading={loading && entries.length === 0}
        pagination={false}
        scroll={{ y: 420 }}
        expandable={{
          expandedRowRender: (record) => (
            <div className="log-paths">
              {record.changedPaths.length === 0 ? (
                <Text type="secondary">{t("无变更路径信息")}</Text>
              ) : (
                record.changedPaths.map((p) => (
                  <div key={`${p.action}:${p.path}`} className="log-path-row">
                    <Tag
                      color={ACTION_COLOR[p.action] ?? "default"}
                      style={{ fontFamily: "monospace", marginInlineEnd: 8 }}
                    >
                      {p.action}
                    </Tag>
                    <Text style={{ fontSize: 12 }}>{p.path}</Text>
                  </div>
                ))
              )}
            </div>
          ),
        }}
      />
    </Modal>
  );
}
