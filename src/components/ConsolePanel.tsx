// 输出控制台：展示每条 svn 命令的执行记录，自动滚动到底部。

import { useEffect, useRef } from "react";
import { Button, Empty } from "antd";
import { ClearOutlined } from "@ant-design/icons";
import { useConsoleStore } from "../stores/consoleStore";

export function ConsolePanel() {
  const lines = useConsoleStore((s) => s.lines);
  const clear = useConsoleStore((s) => s.clear);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新记录到达时滚动到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="console-wrap">
      <div className="console-toolbar">
        <Button size="small" type="text" icon={<ClearOutlined />} onClick={clear}>
          清空
        </Button>
      </div>
      <div ref={scrollRef} className="console-scroll">
        {lines.length === 0 ? (
          <div className="panel-center">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无命令输出" />
          </div>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="console-line">
              <div className={l.success ? "console-cmd ok" : "console-cmd err"}>
                $ {l.command}
                <span className="console-duration">{l.durationMs}ms</span>
              </div>
              {l.output && <pre className="console-output">{l.output}</pre>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
