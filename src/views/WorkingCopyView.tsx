// 主视图：工具栏（更新/提交/日志/刷新）+ 文件状态表 + 下部面板（差异/控制台）+ 状态栏。

import { useMemo, useState } from "react";
import { Alert, Button, Empty, Space, Spin, Typography, message } from "antd";
import {
  CloudDownloadOutlined,
  ReloadOutlined,
  CheckOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import { useAppStore } from "../stores/appStore";
import { FileStatusTable } from "../components/FileStatusTable";
import { BottomPanel } from "../components/BottomPanel";
import { CommitDialog } from "../components/CommitDialog";
import { LogModal } from "../components/LogModal";
import { showSvnError } from "../utils/errorDialog";

const { Text } = Typography;

/** 视为「有改动」的状态（驱动提交按钮可用性与状态栏计数） */
const CHANGED = new Set(["modified", "added", "deleted", "replaced", "unversioned", "conflicted", "missing"]);

export function WorkingCopyView() {
  const selectedId = useAppStore((s) => s.selectedId);
  const workingCopies = useAppStore((s) => s.workingCopies);
  const statusEntries = useAppStore((s) => s.statusEntries);
  const statusLoading = useAppStore((s) => s.statusLoading);
  const statusError = useAppStore((s) => s.statusError);
  const refreshStatus = useAppStore((s) => s.refreshStatus);
  const updateSelected = useAppStore((s) => s.updateSelected);

  const [updating, setUpdating] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const selected = useMemo(
    () => workingCopies.find((w) => w.id === selectedId) ?? null,
    [workingCopies, selectedId],
  );

  const changedCount = useMemo(
    () => statusEntries.filter((e) => CHANGED.has(e.itemStatus)).length,
    [statusEntries],
  );

  async function handleUpdate() {
    setUpdating(true);
    try {
      const rev = await updateSelected();
      if (rev != null) message.success(`已更新到修订 ${rev}`);
    } catch (e) {
      showSvnError(e, "更新失败");
    } finally {
      setUpdating(false);
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
      <div className="wc-toolbar">
        <Space>
          <Button icon={<CloudDownloadOutlined />} onClick={handleUpdate} loading={updating}>
            更新
          </Button>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            disabled={changedCount === 0}
            onClick={() => setCommitOpen(true)}
          >
            提交
          </Button>
          <Button icon={<HistoryOutlined />} onClick={() => setLogOpen(true)}>
            日志
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void refreshStatus()}>
            刷新
          </Button>
        </Space>
        <Text type="secondary" ellipsis style={{ marginLeft: 8, flex: 1 }}>
          {selected.path}
        </Text>
      </div>

      <div style={{ flex: 1, overflow: "hidden", position: "relative", minHeight: 0 }}>
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

      <BottomPanel />

      <div className="wc-statusbar">
        <span>{selected.name}</span>
        <span>{changedCount} 个改动</span>
      </div>

      <CommitDialog open={commitOpen} onClose={() => setCommitOpen(false)} />
      <LogModal open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  );
}
