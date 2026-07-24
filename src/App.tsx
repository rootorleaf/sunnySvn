import { useEffect } from "react";
import { Layout } from "antd";
import { useAppStore } from "./stores/appStore";
import { SvnGuard } from "./components/SvnGuard";
import { Sidebar } from "./components/Sidebar";
import { WorkingCopyView } from "./views/WorkingCopyView";

const { Sider, Content } = Layout;

export default function App() {
  const detectSvn = useAppStore((s) => s.detectSvn);
  const loadWorkingCopies = useAppStore((s) => s.loadWorkingCopies);

  // 启动时探测 svn 并加载已保存的工作副本
  useEffect(() => {
    void detectSvn();
    void loadWorkingCopies();
  }, [detectSvn, loadWorkingCopies]);

  return (
    <SvnGuard>
      <Layout style={{ height: "100vh" }}>
        <Sider width={240} theme="light" style={{ borderRight: "1px solid var(--border)" }}>
          <Sidebar />
        </Sider>
        <Content style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <WorkingCopyView />
        </Content>
      </Layout>
    </SvnGuard>
  );
}
