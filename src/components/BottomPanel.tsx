// 下部面板：差异预览 / 输出控制台 两个 Tab。
// 选中文件变化时自动切到「差异」页。
// 顶缘有拖动条，可上下拖动调节面板高度（持久化到 localStorage）。

import { useEffect, useState } from "react";
import { Tabs } from "antd";
import { useAppStore } from "../stores/appStore";
import { DiffView } from "./DiffView";
import { ConsolePanel } from "./ConsolePanel";
import { t } from "../i18n";

// 面板高度拖动范围与持久化 key
const PANEL_MIN = 120;
const PANEL_HEIGHT_KEY = "sunnysvn.bottomPanelHeight";
/** 最大高度：给上方文件区至少留 160px */
function maxPanelHeight() {
  return Math.max(PANEL_MIN, window.innerHeight - 160);
}

export function BottomPanel() {
  const selectedFile = useAppStore((s) => s.selectedFile);
  const [active, setActive] = useState("diff");

  // 面板高度：读上次保存值，拖动结束时写回
  const [height, setHeight] = useState(() => {
    const saved = Number(localStorage.getItem(PANEL_HEIGHT_KEY));
    return Number.isFinite(saved) && saved >= PANEL_MIN
      ? Math.min(saved, maxPanelHeight())
      : 300;
  });
  const [resizing, setResizing] = useState(false);

  // 顶缘拖动调高：pointer 事件（同侧栏宽度，HTML5 DnD 在 Tauri macOS 下不可用）
  function handleResizeStart(e: React.PointerEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    setResizing(true);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const clamp = (h: number) => Math.min(maxPanelHeight(), Math.max(PANEL_MIN, h));
    const onMove = (ev: PointerEvent) => {
      // 向上拖 = 面板变高
      setHeight(clamp(startH - (ev.clientY - startY)));
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem(PANEL_HEIGHT_KEY, String(clamp(startH - (ev.clientY - startY))));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  useEffect(() => {
    if (selectedFile) setActive("diff");
  }, [selectedFile]);

  return (
    <div className="bottom-panel" style={{ height }}>
      {/* 顶缘拖动条：调节面板高度 */}
      <div
        className={`panel-resizer${resizing ? " panel-resizer-active" : ""}`}
        onPointerDown={handleResizeStart}
      />
      <Tabs
        size="small"
        activeKey={active}
        onChange={setActive}
        style={{ height: "100%" }}
        items={[
          { key: "diff", label: t("差异"), children: <DiffView /> },
          { key: "console", label: t("控制台"), children: <ConsolePanel /> },
        ]}
      />
    </div>
  );
}
