import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Dropdown, List, Modal, Space, Typography, Popconfirm, message } from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  CloudDownloadOutlined,
  GlobalOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useAppStore } from "../stores/appStore";
import * as svnApi from "../api/svn";
import { showSvnError } from "../utils/errorDialog";
import { CheckoutDialog } from "./CheckoutDialog";
import { RepoBrowser } from "./RepoBrowser";
import { ThemeToggle } from "./ThemeToggle";
import { SettingsDialog } from "./SettingsDialog";
import { t } from "../i18n";
import type { SvnError } from "../api/svn";
import type { WorkingCopy } from "../types";

const { Text } = Typography;

// 侧栏：工作副本列表 + 添加/移除。添加时用系统目录选择器，
// 后端会校验所选目录是否为有效 svn 工作副本。
// 每项支持右键菜单：在 Finder 中显示 / 从列表移除。
// 支持从 Finder 拖动目录到侧栏区域直接添加为工作副本。
// 底部有设置入口。
export function Sidebar() {
  const workingCopies = useAppStore((s) => s.workingCopies);
  const selectedId = useAppStore((s) => s.selectedId);
  const selectWorkingCopy = useAppStore((s) => s.selectWorkingCopy);
  const addWorkingCopy = useAppStore((s) => s.addWorkingCopy);
  const removeWorkingCopy = useAppStore((s) => s.removeWorkingCopy);
  const [adding, setAdding] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  // 各工作副本的改动文件数（id → count），侧栏角标用
  const [counts, setCounts] = useState<Record<string, number>>({});

  // 工作副本列表变化时，异步获取每个的改动数
  useEffect(() => {
    let stale = false;
    const nextCounts: Record<string, number> = {};
    void Promise.all(
      workingCopies.map(async (wc) => {
        try {
          const c = await svnApi.getStatusCount(wc.path);
          nextCounts[wc.id] = c;
        } catch {
          nextCounts[wc.id] = 0;
        }
      }),
    ).then(() => {
      if (!stale) setCounts(nextCounts);
    });
    return () => {
      stale = true;
    };
  }, [workingCopies]);

  /** 刷新单个工作副本的改动计数（操作后可调） */
  const refreshCount = useCallback((id: string, path: string) => {
    svnApi
      .getStatusCount(path)
      .then((c) => setCounts((prev) => ({ ...prev, [id]: c })))
      .catch(() => {});
  }, []);
  // 选中工作副本切换时，刷新其计数（操作可能改变了改动数）
  useEffect(() => {
    if (!selectedId) return;
    const wc = workingCopies.find((w) => w.id === selectedId);
    if (wc) refreshCount(wc.id, wc.path);
  }, [selectedId, workingCopies, refreshCount]);

  // 批量添加拖入/选择的目录，逐个校验并反馈。
  async function addPaths(paths: string[]) {
    if (paths.length === 0) return;
    setAdding(true);
    let ok = 0;
    const failed: string[] = [];
    for (const p of paths) {
      try {
        await addWorkingCopy(p);
        ok += 1;
      } catch (e) {
        const err = e as SvnError;
        const name = p.split("/").pop() || p;
        failed.push(
          err.code === "NOT_WORKING_COPY" ? t("{0}（不是 SVN 工作副本）", name) : `${name}（${err.message}）`,
        );
      }
    }
    setAdding(false);
    if (ok > 0) message.success(t("已添加 {0} 个工作副本", ok));
    if (failed.length > 0) message.error(t("未能添加：{0}", failed.join("、")));
  }

  // 判断落点（物理像素）是否落在侧栏矩形内。
  function isInsideSidebar(x: number, y: number): boolean {
    const el = sidebarRef.current;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    // Tauri 拖放事件坐标是物理像素，换算成 CSS 像素再比较
    const dpr = window.devicePixelRatio || 1;
    const cx = x / dpr;
    const cy = y / dpr;
    return cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
  }

  // 监听 Tauri 原生拖放事件（webview 全局），仅处理落在侧栏内的拖放。
  useEffect(() => {
    const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
      const p = event.payload;
      if (p.type === "over") {
        setDragOver(isInsideSidebar(p.position.x, p.position.y));
      } else if (p.type === "drop") {
        const inside = isInsideSidebar(p.position.x, p.position.y);
        setDragOver(false);
        if (inside && p.paths.length > 0) {
          void addPaths(p.paths);
        }
      } else {
        // "leave" 或其它
        setDragOver(false);
      }
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd() {
    const selected = await open({ directory: true, multiple: true, title: t("选择 SVN 工作副本目录") });
    if (selected == null) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    await addPaths(paths);
  }

  function handleMenuClick(key: string, wc: WorkingCopy) {
    if (key === "reveal") {
      svnApi.revealInFinder(wc.path).catch((e) => showSvnError(e, t("无法在 Finder 中显示")));
    } else if (key === "remove") {
      Modal.confirm({
        title: t("从列表移除？"),
        content: t("仅从应用移除，不会删除本地文件。"),
        okText: t("移除"),
        cancelText: t("取消"),
        onOk: () => void removeWorkingCopy(wc.id),
      });
    }
  }

  return (
    <div
      ref={sidebarRef}
      className={dragOver ? "sidebar-drop-active" : undefined}
      style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}
    >
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Text strong>{t("工作副本")}</Text>
        <Space size={0}>
          <Button
            size="small"
            type="text"
            icon={<GlobalOutlined />}
            onClick={() => setBrowserOpen(true)}
            title={t("仓库浏览器")}
          />
          <Button
            size="small"
            type="text"
            icon={<CloudDownloadOutlined />}
            onClick={() => setCheckoutOpen(true)}
            title={t("Checkout 仓库")}
          />
          <Button
            size="small"
            type="text"
            icon={<PlusOutlined />}
            loading={adding}
            onClick={handleAdd}
            title={t("添加本地工作副本")}
          />
          <ThemeToggle />
        </Space>
      </div>
      <List
        style={{ flex: 1, overflow: "auto" }}
        dataSource={workingCopies}
        locale={{ emptyText: t("尚未添加工作副本（可从 Finder 拖入目录）") }}
        renderItem={(wc) => (
          <Dropdown
            key={wc.id}
            trigger={["contextMenu"]}
            menu={{
              items: [
                { key: "reveal", label: t("在 Finder 中显示"), icon: <FolderOpenOutlined /> },
                { type: "divider" },
                { key: "remove", label: t("从列表移除"), icon: <DeleteOutlined />, danger: true },
              ],
              onClick: ({ key }) => handleMenuClick(key, wc),
            }}
          >
            <List.Item
              className={`wc-item${wc.id === selectedId ? " wc-item-selected" : ""}`}
              style={{ padding: "8px 16px", cursor: "pointer" }}
              onClick={() => selectWorkingCopy(wc.id)}
              actions={[
                (counts[wc.id] ?? 0) > 0 ? (
                  <Badge key="count" count={counts[wc.id]} style={{ backgroundColor: "#fa8c16" }} />
                ) : null,
                <Popconfirm
                  key="del"
                  title={t("从列表移除？")}
                  description={t("仅从应用移除，不会删除本地文件。")}
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    void removeWorkingCopy(wc.id);
                  }}
                  onCancel={(e) => e?.stopPropagation()}
                >
                  <Button
                    size="small"
                    type="text"
                    icon={<DeleteOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                avatar={<FolderOutlined style={{ fontSize: 16, color: "var(--icon)" }} />}
                title={<Text ellipsis>{wc.name}</Text>}
                description={
                  <Text type="secondary" ellipsis style={{ fontSize: 12 }}>
                    {wc.path}
                  </Text>
                }
              />
            </List.Item>
          </Dropdown>
        )}
      />
      {/* 底部：设置入口 */}
      <div
        style={{
          padding: "8px 16px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        <Button
          size="small"
          type="text"
          icon={<SettingOutlined />}
          onClick={() => setSettingsOpen(true)}
          title={t("设置")}
        />
      </div>
      {dragOver && (
        <div className="sidebar-drop-hint">
          <FolderOpenOutlined style={{ fontSize: 28, marginBottom: 8 }} />
          <div>{t("松开以添加为工作副本")}</div>
        </div>
      )}
      <CheckoutDialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />
      <RepoBrowser open={browserOpen} onClose={() => setBrowserOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
