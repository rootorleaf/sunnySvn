import { useEffect } from "react";
import { Layout } from "antd";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "./stores/appStore";
import { subscribeConsole } from "./stores/consoleStore";
import { useTheme } from "./theme/ThemeProvider";
import { SvnGuard } from "./components/SvnGuard";
import { Sidebar } from "./components/Sidebar";
import { WorkingCopyView } from "./views/WorkingCopyView";

const { Sider, Content } = Layout;

export default function App() {
  const detectSvn = useAppStore((s) => s.detectSvn);
  const loadWorkingCopies = useAppStore((s) => s.loadWorkingCopies);
  const { isDark } = useTheme();

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
          width={240}
          theme={isDark ? "dark" : "light"}
          style={{ borderRight: "1px solid var(--border)" }}
        >
          <Sidebar />
        </Sider>
        <Content style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <WorkingCopyView />
        </Content>
      </Layout>
    </SvnGuard>
  );
}
