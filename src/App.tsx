import { useEffect, useState } from "react";
import { Layout } from "antd";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "./stores/appStore";
import { subscribeConsole } from "./stores/consoleStore";
import { useTheme } from "./theme/ThemeProvider";
import { SvnGuard } from "./components/SvnGuard";
import { Sidebar } from "./components/Sidebar";
import { WorkingCopyView } from "./views/WorkingCopyView";

const { Sider, Content } = Layout;

// 侧栏宽度可拖动调节的范围与持久化 key
const SIDER_MIN = 180;
const SIDER_MAX = 480;
const SIDER_WIDTH_KEY = "sunnysvn.siderWidth";

export default function App() {
  const detectSvn = useAppStore((s) => s.detectSvn);
  const loadWorkingCopies = useAppStore((s) => s.loadWorkingCopies);
  const { isDark } = useTheme();

  // 侧栏宽度：读上次保存值，拖动结束时写回
  const [siderWidth, setSiderWidth] = useState(() => {
    const saved = Number(localStorage.getItem(SIDER_WIDTH_KEY));
    return Number.isFinite(saved) && saved >= SIDER_MIN && saved <= SIDER_MAX ? saved : 240;
  });
  const [resizing, setResizing] = useState(false);

  // 分隔条拖动：pointer 事件（与侧栏排序同理，HTML5 DnD 在 Tauri macOS 下不可用）
  function handleResizeStart(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = siderWidth;
    setResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const clamp = (x: number) => Math.min(SIDER_MAX, Math.max(SIDER_MIN, x));
    const onMove = (ev: PointerEvent) => {
      setSiderWidth(clamp(startW + (ev.clientX - startX)));
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem(SIDER_WIDTH_KEY, String(clamp(startW + (ev.clientX - startX))));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // 启动时探测 svn 并加载已保存的工作副本
  useEffect(() => {
    void detectSvn();
    void loadWorkingCopies();
  }, [detectSvn, loadWorkingCopies]);

  // 订阅后端 svn 命令的控制台输出事件
  useEffect(() => {
    const sub = subscribeConsole();
    return () => {
      void sub.then((unlisten) => unlisten());
    };
  }, []);

  // 订阅文件监控事件：工作副本内文件变动时自动刷新状态
  useEffect(() => {
    const sub = listen<string>("wc-changed", () => {
      void useAppStore.getState().refreshStatus();
    });
    return () => {
      void sub.then((unlisten) => unlisten());
    };
  }, []);

  return (
    <SvnGuard>
      <Layout style={{ height: "100vh" }}>
        <Sider
          width={siderWidth}
          theme={isDark ? "dark" : "light"}
          style={{ borderRight: "1px solid var(--border)", position: "relative" }}
        >
          <Sidebar />
          {/* 右缘拖动条：调节侧栏宽度 */}
          <div
            className={`sider-resizer${resizing ? " sider-resizer-active" : ""}`}
            onPointerDown={handleResizeStart}
          />
        </Sider>
        <Content style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <WorkingCopyView />
        </Content>
      </Layout>
    </SvnGuard>
  );
}
