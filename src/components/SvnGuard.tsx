import { ReactNode } from "react";
import { Result, Spin, Typography, Button } from "antd";
import { useAppStore } from "../stores/appStore";
import { t } from "../i18n";

const { Paragraph, Text } = Typography;

/**
 * 守卫组件：应用启动先探测 svn。
 * - 探测中显示 loading
 * - 未找到 svn 时给出 brew 安装引导，阻断后续界面
 * - 探测成功才渲染子内容
 */
export function SvnGuard({ children }: { children: ReactNode }) {
  const detecting = useAppStore((s) => s.detecting);
  const svnInfo = useAppStore((s) => s.svnInfo);
  const svnError = useAppStore((s) => s.svnError);
  const detectSvn = useAppStore((s) => s.detectSvn);

  if (detecting) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center" }}>
        <Spin tip={t("正在检测 svn 环境…")} size="large" />
      </div>
    );
  }

  if (svnError || !svnInfo) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center" }}>
        <Result
          status="warning"
          title={t("未找到可用的 svn")}
          subTitle={svnError?.message ?? t("请先安装 Subversion 命令行工具")}
          extra={[
            <div key="tip" style={{ textAlign: "left", maxWidth: 460 }}>
              <Paragraph>
                {t("SunnySVN 依赖系统的 svn 命令行。可通过 Homebrew 安装：")}
              </Paragraph>
              <Paragraph>
                <Text code copyable>
                  brew install subversion
                </Text>
              </Paragraph>
              <Button type="primary" onClick={() => void detectSvn()}>
                {t("重新检测")}
              </Button>
            </div>,
          ]}
        />
      </div>
    );
  }

  return <>{children}</>;
}
