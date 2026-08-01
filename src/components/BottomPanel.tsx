// 下部面板：差异预览 / 输出控制台 两个 Tab。
// 选中文件变化时自动切到「差异」页。

import { useEffect, useState } from "react";
import { Tabs } from "antd";
import { useAppStore } from "../stores/appStore";
import { DiffView } from "./DiffView";
import { ConsolePanel } from "./ConsolePanel";
import { t } from "../i18n";

export function BottomPanel() {
  const selectedFile = useAppStore((s) => s.selectedFile);
  const [active, setActive] = useState("diff");

  useEffect(() => {
    if (selectedFile) setActive("diff");
  }, [selectedFile]);

  return (
    <div className="bottom-panel">
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
