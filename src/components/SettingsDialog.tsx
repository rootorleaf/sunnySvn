import { useEffect, useState } from "react";
import {
  Modal,
  Segmented,
  Input,
  Button,
  Typography,
  Descriptions,
  Table,
  Tag,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  BgColorsOutlined,
  ToolOutlined,
  KeyOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { useTheme, type ThemeMode, type FontScale } from "../theme/ThemeProvider";
import * as svnApi from "../api/svn";
import type { SvnInfo } from "../types";

const { Text, Title } = Typography;

type Section = "appearance" | "svn" | "hotkeys" | "about";

const NAV_ITEMS: { key: Section; label: string; icon: React.ReactNode }[] = [
  { key: "appearance", label: "外观", icon: <BgColorsOutlined /> },
  { key: "svn", label: "svn 路径", icon: <ToolOutlined /> },
  { key: "hotkeys", label: "快捷键", icon: <KeyOutlined /> },
  { key: "about", label: "关于", icon: <InfoCircleOutlined /> },
];

/** 快捷键列表 */
const HOTKEYS: { keys: string; desc: string }[] = [
  { keys: "Cmd+R", desc: "刷新状态" },
  { keys: "Cmd+U", desc: "更新工作副本" },
  { keys: "Cmd+Enter", desc: "打开提交对话框" },
  { keys: "Cmd+L", desc: "打开日志" },
  { keys: "Cmd+B", desc: "打开分支 / 标签" },
  { keys: "Cmd+P", desc: "打开属性编辑" },
  { keys: "Esc", desc: "关闭当前对话框" },
];

const HOTKEY_COLUMNS: ColumnsType<{ keys: string; desc: string }> = [
  { title: "操作", dataIndex: "desc", key: "desc" },
  {
    title: "快捷键",
    dataIndex: "keys",
    key: "keys",
    width: 140,
    render: (k: string) => <Tag style={{ fontFamily: "monospace" }}>{k}</Tag>,
  },
];

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mode, setMode, fontScale, setFontScale } = useTheme();
  const [section, setSection] = useState<Section>("appearance");
  const [svnPath, setSvnPath] = useState("");
  const [svnInfo, setSvnInfo] = useState<SvnInfo | null>(null);
  const [savingPath, setSavingPath] = useState(false);

  useEffect(() => {
    if (!open) return;
    svnApi.getSvnPathOverride().then(setSvnPath).catch(() => {});
    svnApi.detectSvn().then(setSvnInfo).catch(() => setSvnInfo(null));
  }, [open]);

  async function handleSavePath() {
    setSavingPath(true);
    try {
      await svnApi.setSvnPathOverride(svnPath.trim());
      const info = await svnApi.detectSvn();
      setSvnInfo(info);
      message.success("svn 路径已更新");
    } catch (e) {
      message.error(`svn 路径无效：${(e as { message?: string }).message ?? e}`);
    } finally {
      setSavingPath(false);
    }
  }

  function renderContent() {
    switch (section) {
      case "appearance":
        return (
          <div style={{ padding: "4px 0" }}>
            <Title level={5} style={{ marginTop: 0 }}>外观</Title>
            <div style={{ marginBottom: 24 }}>
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                主题
              </Text>
              <Segmented
                value={mode}
                onChange={(v) => setMode(v as ThemeMode)}
                options={[
                  { label: "跟随系统", value: "system" },
                  { label: "浅色", value: "light" },
                  { label: "深色", value: "dark" },
                ]}
              />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                字号
              </Text>
              <Segmented
                value={fontScale}
                onChange={(v) => setFontScale(v as FontScale)}
                options={[
                  { label: "小", value: "small" },
                  { label: "中", value: "medium" },
                  { label: "大", value: "large" },
                ]}
              />
            </div>
          </div>
        );
      case "svn":
        return (
          <div style={{ padding: "4px 0" }}>
            <Title level={5} style={{ marginTop: 0 }}>svn 路径</Title>
            <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
              留空则自动探测（PATH、Homebrew 常见位置）。指定后覆盖自动探测。
            </Text>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <Input
                placeholder="/opt/homebrew/bin/svn"
                value={svnPath}
                onChange={(e) => setSvnPath(e.target.value)}
                onPressEnter={handleSavePath}
              />
              <Button type="primary" loading={savingPath} onClick={handleSavePath}>
                保存
              </Button>
            </div>
            {svnInfo && (
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="当前 svn 版本">
                  {svnInfo.version.split("\n")[0] || "—"}
                </Descriptions.Item>
                <Descriptions.Item label="当前 svn 路径">
                  {svnInfo.path || "—"}
                </Descriptions.Item>
              </Descriptions>
            )}
          </div>
        );
      case "hotkeys":
        return (
          <div style={{ padding: "4px 0" }}>
            <Title level={5} style={{ marginTop: 0 }}>快捷键</Title>
            <Table
              rowKey="keys"
              size="small"
              pagination={false}
              columns={HOTKEY_COLUMNS}
              dataSource={HOTKEYS}
              style={{ marginTop: 8 }}
            />
          </div>
        );
      case "about":
        return (
          <div style={{ padding: "4px 0" }}>
            <Title level={5} style={{ marginTop: 0 }}>关于</Title>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="应用">SunnySVN</Descriptions.Item>
              <Descriptions.Item label="版本">0.1.0</Descriptions.Item>
              <Descriptions.Item label="svn 版本">
                {svnInfo ? svnInfo.version.split("\n")[0] : "未检测到"}
              </Descriptions.Item>
              <Descriptions.Item label="svn 路径">
                {svnInfo?.path ?? "—"}
              </Descriptions.Item>
            </Descriptions>
          </div>
        );
    }
  }

  return (
    <Modal
      title="设置"
      open={open}
      onCancel={onClose}
      footer={null}
      width={680}
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ display: "flex", height: 420 }}>
        {/* 左侧导航 */}
        <div
          style={{
            width: 160,
            flexShrink: 0,
            borderRight: "1px solid var(--border-color)",
            padding: "8px 0",
            overflow: "auto",
          }}
        >
          {NAV_ITEMS.map((item) => (
            <div
              key={item.key}
              onClick={() => setSection(item.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                cursor: "pointer",
                background:
                  section === item.key ? "var(--selected-bg, rgba(22,119,255,0.12))" : undefined,
                borderLeft:
                  section === item.key
                    ? "3px solid var(--selected-border, #1677ff)"
                    : "3px solid transparent",
                fontSize: 13,
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        {/* 右侧内容 */}
        <div style={{ flex: 1, padding: "16px 24px", overflow: "auto" }}>
          {renderContent()}
        </div>
      </div>
    </Modal>
  );
}
