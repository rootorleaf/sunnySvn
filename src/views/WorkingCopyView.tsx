// 主视图：工具栏（更新/提交/日志/刷新）+ 文件状态表 + 下部面板（差异/控制台）+ 状态栏。

import { useCallback, useMemo, useState } from "react";
import { Alert, Button, Dropdown, Empty, Space, Spin, Typography, message } from "antd";
import type { MenuProps } from "antd";
import {
  CloudDownloadOutlined,
  ReloadOutlined,
  CheckOutlined,
  HistoryOutlined,
  BranchesOutlined,
  SwapOutlined,
  MergeCellsOutlined,
  ToolOutlined,
  DownOutlined,
  ProfileOutlined,
  PartitionOutlined,
  UnorderedListOutlined,
  ApartmentOutlined,
} from "@ant-design/icons";
import { useAppStore } from "../stores/appStore";
import { FileStatusTable } from "../components/FileStatusTable";
import { FileTreeView } from "../components/FileTreeView";
import { BottomPanel } from "../components/BottomPanel";
import { CommitDialog } from "../components/CommitDialog";
import { LogModal } from "../components/LogModal";
import { BranchDialog } from "../components/BranchDialog";
import { SwitchDialog } from "../components/SwitchDialog";
import { MergeDialog } from "../components/MergeDialog";
import { PropertyDialog } from "../components/PropertyDialog";
import { RevisionGraphModal } from "../components/RevisionGraphModal";
import * as svnApi from "../api/svn";
import { showSvnError } from "../utils/errorDialog";
import { decodeSvnText } from "../utils/svnPath";
import { useHotkeys } from "../hooks/useHotkeys";
import { t } from "../i18n";

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
  const [branchOpen, setBranchOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [propOpen, setPropOpen] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [revGraphOpen, setRevGraphOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "tree">("tree");

  const selected = useMemo(
    () => workingCopies.find((w) => w.id === selectedId) ?? null,
    [workingCopies, selectedId],
  );

  const changedCount = useMemo(
    () => statusEntries.filter((e) => CHANGED.has(e.itemStatus)).length,
    [statusEntries],
  );

  const hasConflicts = useMemo(
    () => statusEntries.some((e) => e.itemStatus === "conflicted"),
    [statusEntries],
  );

  const handleUpdate = useCallback(async () => {
    setUpdating(true);
    try {
      const rev = await updateSelected();
      if (rev != null) message.success(t("已更新到修订 {0}", rev));
    } catch (e) {
      showSvnError(e, t("更新失败"));
    } finally {
      setUpdating(false);
    }
  }, [updateSelected]);

  // 全局快捷键：⌘R 刷新 / ⌘U 更新 / ⌘↩ 提交 / ⌘L 日志 / ⌘B 分支 / ⌘P 属性 / Esc 关闭对话框
  const hotkeys = useMemo(
    () => ({
      onRefresh: () => void refreshStatus(),
      onUpdate: () => void handleUpdate(),
      onCommit: () => {
        if (changedCount > 0) setCommitOpen(true);
        else message.info(t("没有可提交的改动"));
      },
      onLog: () => setLogOpen(true),
      onBranch: () => setBranchOpen(true),
      onProperty: () => setPropOpen(true),
      onEscape: () => {
        if (commitOpen) setCommitOpen(false);
        else if (logOpen) setLogOpen(false);
        else if (branchOpen) setBranchOpen(false);
        else if (switchOpen) setSwitchOpen(false);
        else if (mergeOpen) setMergeOpen(false);
        else if (propOpen) setPropOpen(false);
      },
    }),
    [
      refreshStatus,
      handleUpdate,
      changedCount,
      commitOpen,
      logOpen,
      branchOpen,
      switchOpen,
      mergeOpen,
      propOpen,
    ],
  );
  useHotkeys(hotkeys, !!selected);

  async function handleCleanup() {
    if (!selected) return;
    setCleaningUp(true);
    try {
      await svnApi.cleanupWc(selected.path);
      message.success(t("Cleanup 完成"));
      await refreshStatus();
    } catch (e) {
      showSvnError(e, t("Cleanup 失败"));
    } finally {
      setCleaningUp(false);
    }
  }

  const moreMenu: MenuProps = {
    items: [
      { key: "props", label: t("属性编辑"), icon: <ProfileOutlined /> },
      { key: "revgraph", label: t("修订版本图"), icon: <PartitionOutlined /> },
      { key: "cleanup", label: "Cleanup", icon: <ToolOutlined /> },
    ],
    onClick: ({ key }) => {
      if (key === "cleanup") void handleCleanup();
      else if (key === "props") setPropOpen(true);
      else if (key === "revgraph") setRevGraphOpen(true);
    },
  };

  if (!selected) {
    return (
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Empty description={t("从左侧选择或添加一个工作副本")} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="wc-toolbar">
        <Space>
          <Button icon={<CloudDownloadOutlined />} onClick={() => void handleUpdate()} loading={updating} title={t("更新 ⌘U")}>
            {t("更新")}
          </Button>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            disabled={changedCount === 0}
            onClick={() => setCommitOpen(true)}
            title={t("提交 ⌘↩")}
          >
            {t("提交")}
          </Button>
          <Button icon={<HistoryOutlined />} onClick={() => setLogOpen(true)} title={t("日志 ⌘L")}>
            {t("日志")}
          </Button>
          <Button icon={<BranchesOutlined />} onClick={() => setBranchOpen(true)} title={t("分支/标签 ⌘B")}>
            {t("分支/标签")}
          </Button>
          <Button icon={<SwapOutlined />} onClick={() => setSwitchOpen(true)}>
            {t("切换")}
          </Button>
          <Button icon={<MergeCellsOutlined />} onClick={() => setMergeOpen(true)}>
            {t("合并")}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void refreshStatus()} title={t("刷新 ⌘R")}>
            {t("刷新")}
          </Button>
          <Space.Compact>
            <Button
              size="small"
              type={viewMode === "tree" ? "primary" : "default"}
              icon={<ApartmentOutlined />}
              onClick={() => setViewMode("tree")}
              title={t("文件树视图")}
            />
            <Button
              size="small"
              type={viewMode === "list" ? "primary" : "default"}
              icon={<UnorderedListOutlined />}
              onClick={() => setViewMode("list")}
              title={t("列表视图")}
            />
          </Space.Compact>
          <Dropdown menu={moreMenu} disabled={cleaningUp}>
            <Button icon={<DownOutlined />} loading={cleaningUp}>
              {t("更多")}
            </Button>
          </Dropdown>
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
            message={t("读取状态失败")}
            description={`${statusError.code}: ${statusError.message}`}
          />
        ) : statusLoading && statusEntries.length === 0 ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 48 }}>
            <Spin />
          </div>
        ) : viewMode === "tree" ? (
          <FileTreeView wcPath={selected.path} entries={statusEntries} />
        ) : (
          <FileStatusTable entries={statusEntries} />
        )}
      </div>

      <BottomPanel />

      <div className="wc-statusbar">
        <span>{decodeSvnText(selected.name)}</span>
        <span>
          {t("{0} 个改动", changedCount)}
          {hasConflicts && <span style={{ color: "#cf1322", marginLeft: 8 }}>· {t("存在冲突")}</span>}
        </span>
      </div>

      <CommitDialog open={commitOpen} onClose={() => setCommitOpen(false)} />
      <LogModal open={logOpen} onClose={() => setLogOpen(false)} />
      <BranchDialog
        open={branchOpen}
        wcPath={selected.path}
        onClose={() => setBranchOpen(false)}
      />
      <SwitchDialog
        open={switchOpen}
        wcPath={selected.path}
        onClose={() => setSwitchOpen(false)}
        onSwitched={() => void refreshStatus()}
      />
      <MergeDialog
        open={mergeOpen}
        wcPath={selected.path}
        onClose={() => setMergeOpen(false)}
        onMerged={() => void refreshStatus()}
      />
      <PropertyDialog
        open={propOpen}
        wcPath={selected.path}
        onClose={() => setPropOpen(false)}
      />
      <RevisionGraphModal
        open={revGraphOpen}
        wcPath={selected.path}
        onClose={() => setRevGraphOpen(false)}
      />
    </div>
  );
}
