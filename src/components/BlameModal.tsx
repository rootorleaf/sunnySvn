// Blame 注释视图：逐行显示作者 / 修订 / 内容。
// 打开时按 file 读取 blame，未提交的本地新增行 revision 为 null。

import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Spin, Typography } from "antd";
import * as svnApi from "../api/svn";
import type { SvnError } from "../api/svn";
import type { BlameLine } from "../types";

const { Text } = Typography;

/** 给每个修订号分配一个稳定的浅色背景，便于肉眼区分不同提交 */
const REV_COLORS = [
  "#fef3c7",
  "#dbeafe",
  "#dcfce7",
  "#fae8ff",
  "#fee2e2",
  "#e0e7ff",
  "#ccfbf1",
  "#ffedd5",
];

function revColor(rev: number | null): string {
  if (rev == null) return "transparent";
  return REV_COLORS[rev % REV_COLORS.length];
}

export function BlameModal({
  open,
  wcPath,
  file,
  onClose,
}: {
  open: boolean;
  wcPath: string | null;
  file: string | null;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<BlameLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SvnError | null>(null);

  useEffect(() => {
    if (!open || !wcPath || !file) return;
    let stale = false;
    setLoading(true);
    setError(null);
    setLines([]);
    svnApi
      .getBlame(wcPath, file)
      .then((res) => {
        if (!stale) setLines(res);
      })
      .catch((e) => {
        if (!stale) setError(e as SvnError);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [open, wcPath, file]);

  // 行号列宽随最大行号自适应
  const gutterWidth = useMemo(() => {
    const maxLine = lines.length;
    return Math.max(3, String(maxLine).length) + 1;
  }, [lines.length]);

  return (
    <Modal
      title={<span>Blame · {file}</span>}
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      destroyOnClose
    >
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : error ? (
        <Alert
          type={error.code === "IS_DIRECTORY" ? "info" : "error"}
          showIcon
          message={error.code}
          description={error.message}
        />
      ) : (
        <div className="blame-wrap">
          {lines.map((l) => (
            <div key={l.lineNumber} className="blame-row">
              <span
                className="blame-meta"
                style={{ background: revColor(l.revision) }}
                title={l.date ? `${l.author} · ${l.date}` : "本地未提交改动"}
              >
                <span className="blame-rev">{l.revision ?? "•"}</span>
                <span className="blame-author">{l.author || "—"}</span>
              </span>
              <span
                className="blame-ln"
                style={{ minWidth: `${gutterWidth}ch` }}
              >
                {l.lineNumber}
              </span>
              <span className="blame-code">{l.content || " "}</span>
            </div>
          ))}
          {lines.length === 0 && <Text type="secondary">（空文件）</Text>}
        </div>
      )}
    </Modal>
  );
}
