import { useMemo } from "react";
import { Button, Space, Typography, Empty, Alert, Spin, message } from "antd";
import { ReloadOutlined, CloudDownloadOutlined } from "@ant-design/icons";
import { useAppStore } from "../stores/appStore";
import { FileStatusTable } from "../components/FileStatusTable";
import type { SvnError } from "../api/svn";

const { Text } = Typography;

// 主视图：顶部工具栏（刷新 / 更新）+ 文件状态表 + 底部状态栏。
export function WorkingCopyView() {
  const selectedId = useAppStore((s) => s.selectedId);
  const workingCopies = useAppStore((s) => s.workingCopies);
  const statusEntries = useAppStore((s) => s.statusEntries);
  const statusLoading = useAppStore((s) => s.statusLoading);
  const statusError = useAppStore((s) => s.statusError);
  const refreshStatus = useAppStore((s) => s.refreshStatus);
  const updateSelected = useAppStore((s) => s.updateSelected);

  const selected = useMemo(
    () => workingCopies.find((w) => w.id === selectedId) ?? null,
    [workingCopies, selectedId],
  );

  const changedCount = useMemo(
    () => statusEntries.filter((e) => e.itemStatus !== "normal" && e.itemStatus !== "none").length,
    [statusEntries],
  );

  async function handleUpdate() {
    try {
      const rev = await updateSelected();
      if (rev != null) message.success(`已更新到修订 ${rev}`);
    } catch (e) {
      message.error(`更新失败：${(e as SvnError).message}`);
    }
  }

  if (!selected) {
    return (
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Empty description="从左侧选择或添加一个工作副本" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Space>
          <Button
            icon={<CloudDownloadOutlined />}
            onClick={handleUpdate}
            loading={statusLoading}
          >
            更新
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void refreshStatus()}>
            刷新
          </Button>
        </Space>
        <Text type="secondary" ellipsis style={{ marginLeft: 8 }}>
          {selected.path}
        </Text>
      </div>

      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {statusError ? (
          <Alert
            type="error"
            showIcon
            style={{ margin: 16 }}
            message="读取状态失败"
            description={`${statusError.code}: ${statusError.message}`}
          />
        ) : statusLoading && statusEntries.length === 0 ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 48 }}>
            <Spin />
          </div>
        ) : (
          <FileStatusTable entries={statusEntries} />
        )}
      </div>

      <div
        style={{
          padding: "4px 16px",
          borderTop: "1px solid var(--border)",
          fontSize: 12,
          color: "var(--text-secondary)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{selected.name}</span>
        <span>{changedCount} 个改动</span>
      </div>
    </div>
  );
}
