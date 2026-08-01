// 修订版本图（简化）：以仓库根的最近 N 条日志为数据源，
// trunk / branches/* / tags/* 各画一条泳道；修订触碰泳道处画节点，
// 分支/标签创建（copyfrom）画连线，泳道根被删除画 ✕。
// 点击节点在右侧展示该修订的详情（作者/时间/说明/变更路径）。

import { useEffect, useMemo, useState } from "react";
import { Alert, Empty, Modal, Spin, Tag, Typography } from "antd";
import dayjs from "dayjs";
import * as svnApi from "../api/svn";
import { t } from "../i18n";
import type { LogEntry } from "../types";

const { Text, Paragraph } = Typography;

const LIMIT = 200; // 取最近 200 个修订
const ROW_H = 26; // 每个修订一行
const LANE_W = 96; // 泳道间距
const GUTTER = 72; // 左侧修订号列宽
const HEADER_H = 62; // 顶部泳道名区高（sticky）
const R = 4.5; // 节点半径

/** 仓库路径 → 泳道 id（"trunk" / "branches/x" / "tags/x"），非标准布局归入 "/" */
function laneOf(p: string): string {
  if (p === "/trunk" || p.startsWith("/trunk/")) return "trunk";
  const m = p.match(/^\/(branches|tags)\/([^/]+)(\/|$)/);
  if (m) return `${m[1]}/${m[2]}`;
  return "/";
}

function laneColor(lane: string): string {
  if (lane === "trunk") return "#1677ff";
  if (lane.startsWith("branches/")) return "#52c41a";
  if (lane.startsWith("tags/")) return "#fa8c16";
  return "#8c8c8c";
}

function laneLabel(lane: string): string {
  if (lane === "trunk" || lane === "/") return lane;
  return lane.slice(lane.indexOf("/") + 1);
}

/** 分支/标签创建（copyfrom）连线 */
interface CopyEdge {
  fromLane: string;
  fromRev: number;
  toLane: string;
  toRev: number;
}

function buildGraph(entries: LogEntry[]) {
  // entries 为新→旧，行号 0 = 最新
  const revToRow = new Map<number, number>();
  entries.forEach((e, i) => revToRow.set(e.revision, i));

  const touches = new Map<string, number[]>(); // 泳道 → 触碰的行
  const copies: CopyEdge[] = [];
  const dels = new Set<string>(); // "lane@row"：泳道根被删除的位置

  for (const e of entries) {
    const row = revToRow.get(e.revision)!;
    const lanesHit = new Set<string>();
    for (const p of e.changedPaths) {
      const lane = laneOf(p.path);
      lanesHit.add(lane);
      const isLaneRoot = p.path === `/${lane}` || (lane === "/" && p.path === "/");
      if ((p.action === "A" || p.action === "R") && p.copyfromPath && isLaneRoot) {
        copies.push({
          fromLane: laneOf(p.copyfromPath),
          fromRev: p.copyfromRev ?? 0,
          toLane: lane,
          toRev: e.revision,
        });
      }
      if (p.action === "D" && isLaneRoot) dels.add(`${lane}@${row}`);
    }
    for (const l of lanesHit) {
      const arr = touches.get(l);
      if (arr) arr.push(row);
      else touches.set(l, [row]);
    }
  }

  // 泳道排序：/ → trunk → branches → tags；同类按出现早晚（旧的在左）
  const lanes = [...touches.keys()];
  const oldestRow = (l: string) => Math.max(...touches.get(l)!);
  const prio = (l: string) =>
    l === "/" ? 0 : l === "trunk" ? 1 : l.startsWith("branches/") ? 2 : 3;
  lanes.sort((a, b) => prio(a) - prio(b) || oldestRow(b) - oldestRow(a) || a.localeCompare(b));
  const laneX = new Map<string, number>();
  lanes.forEach((l, i) => laneX.set(l, GUTTER + LANE_W / 2 + i * LANE_W));

  return { revToRow, touches, copies, dels, lanes, laneX };
}

export function RevisionGraphModal({
  open,
  wcPath,
  onClose,
}: {
  open: boolean;
  wcPath: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<LogEntry | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setSel(null);
    let cancelled = false;
    svnApi
      .getRepoLog(wcPath, LIMIT)
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      .catch((e: { code?: string; message?: string }) => {
        if (!cancelled) setError(`${e.code ?? "UNKNOWN"}: ${e.message ?? String(e)}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, wcPath]);

  const graph = useMemo(() => buildGraph(entries), [entries]);

  const svgW = GUTTER + graph.lanes.length * LANE_W + 24;
  const svgH = entries.length * ROW_H + 16;
  const y = (row: number) => row * ROW_H + ROW_H / 2;

  // 行 → 该行有复制线进入的泳道（创建节点画成空心圆）
  const creationAt = useMemo(() => {
    const s = new Set<string>();
    for (const c of graph.copies) {
      const row = graph.revToRow.get(c.toRev);
      if (row != null) s.add(`${c.toLane}@${row}`);
    }
    return s;
  }, [graph]);

  const selRow = sel ? graph.revToRow.get(sel.revision) : undefined;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={1020}
      style={{ top: 32 }}
      title={
        <span>
          {t("修订版本图")}
          <Text type="secondary" style={{ fontSize: 12, fontWeight: "normal", marginLeft: 12 }}>
            {t("仓库最近 {0} 个修订", LIMIT)} · <span style={{ color: "#1677ff" }}>●</span> trunk{" "}
            <span style={{ color: "#52c41a" }}>●</span> {t("分支")}{" "}
            <span style={{ color: "#fa8c16" }}>●</span> {t("标签")} · ○ {t("创建")} · ✕ {t("删除")}
          </Text>
        </span>
      }
    >
      {error ? (
        <Alert type="error" showIcon message={t("读取仓库日志失败")} description={error} />
      ) : loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
          <Spin />
        </div>
      ) : entries.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("没有日志")} />
      ) : (
        <div style={{ display: "flex", gap: 12, height: "70vh" }}>
          {/* 图区：泳道名 sticky 在顶部，图随滚动 */}
          <div style={{ flex: 1, overflow: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
            <div style={{ width: svgW, position: "relative" }}>
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                  height: HEADER_H,
                  background: "var(--bg-app)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {graph.lanes.map((l) => (
                  <span
                    key={l}
                    title={`/${l === "/" ? "" : l}`}
                    style={{
                      position: "absolute",
                      left: (graph.laneX.get(l) ?? 0) - 6,
                      bottom: 8,
                      transformOrigin: "left bottom",
                      transform: "rotate(-28deg)",
                      color: laneColor(l),
                      fontSize: 12,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      maxWidth: 130,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {laneLabel(l)}
                  </span>
                ))}
              </div>
              <svg width={svgW} height={svgH} style={{ display: "block" }}>
                {/* 行高亮（悬停用 CSS 难做，选中行画底色） */}
                {selRow != null && (
                  <rect
                    x={0}
                    y={selRow * ROW_H}
                    width={svgW}
                    height={ROW_H}
                    fill="var(--selected-bg)"
                  />
                )}
                {/* 修订号列 */}
                {entries.map((e, row) => (
                  <text
                    key={e.revision}
                    x={GUTTER - 10}
                    y={y(row) + 4}
                    textAnchor="end"
                    fontSize={11}
                    fill="var(--text-secondary)"
                    style={{ cursor: "pointer", userSelect: "none" }}
                    onClick={() => setSel(e)}
                  >
                    {e.revision}
                  </text>
                ))}
                {/* 泳道生命线 */}
                {graph.lanes.map((l) => {
                  const rows = graph.touches.get(l)!;
                  const x = graph.laneX.get(l)!;
                  return (
                    <line
                      key={l}
                      x1={x}
                      y1={y(Math.min(...rows))}
                      x2={x}
                      y2={y(Math.max(...rows))}
                      stroke={laneColor(l)}
                      strokeWidth={2}
                      opacity={0.45}
                    />
                  );
                })}
                {/* 复制（创建）连线 */}
                {graph.copies.map((c, i) => {
                  const x1 = graph.laneX.get(c.fromLane);
                  const x2 = graph.laneX.get(c.toLane);
                  const toRow = graph.revToRow.get(c.toRev);
                  if (x1 == null || x2 == null || toRow == null) return null;
                  const fromRow = graph.revToRow.get(c.fromRev);
                  // 来源修订早于窗口时，从图底部虚线引入
                  const y1 = fromRow != null ? y(fromRow) : svgH - 4;
                  const y2 = y(toRow);
                  const midX = (x1 + x2) / 2;
                  return (
                    <path
                      key={i}
                      d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke={laneColor(c.toLane)}
                      strokeWidth={1.5}
                      strokeDasharray={fromRow == null ? "4 3" : undefined}
                      opacity={0.9}
                    />
                  );
                })}
                {/* 节点 */}
                {entries.flatMap((e, row) => {
                  const lanesHit = new Set(e.changedPaths.map((p) => laneOf(p.path)));
                  return [...lanesHit].map((l) => {
                    const x = graph.laneX.get(l);
                    if (x == null) return null;
                    const key = `${l}@${row}`;
                    const color = laneColor(l);
                    const tip = `r${e.revision} · ${e.author || "—"} · ${
                      e.date ? dayjs(e.date).format("YYYY-MM-DD HH:mm") : ""
                    }\n${(e.message || "").split("\n")[0]}`;
                    if (graph.dels.has(key)) {
                      // 泳道根被删除：✕
                      return (
                        <g key={key} style={{ cursor: "pointer" }} onClick={() => setSel(e)}>
                          <title>{tip}</title>
                          <line x1={x - R} y1={y(row) - R} x2={x + R} y2={y(row) + R} stroke="#cf1322" strokeWidth={2} />
                          <line x1={x - R} y1={y(row) + R} x2={x + R} y2={y(row) - R} stroke="#cf1322" strokeWidth={2} />
                        </g>
                      );
                    }
                    const isCreation = creationAt.has(key);
                    return (
                      <circle
                        key={key}
                        cx={x}
                        cy={y(row)}
                        r={R}
                        fill={isCreation ? "var(--bg-app)" : color}
                        stroke={color}
                        strokeWidth={isCreation ? 2 : 0}
                        style={{ cursor: "pointer" }}
                        onClick={() => setSel(e)}
                      >
                        <title>{tip}</title>
                      </circle>
                    );
                  });
                })}
              </svg>
            </div>
          </div>
          {/* 详情面板 */}
          <div
            style={{
              width: 300,
              flexShrink: 0,
              overflow: "auto",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: 12,
            }}
          >
            {sel ? (
              <>
                <div style={{ marginBottom: 8 }}>
                  <Tag color="blue">r{sel.revision}</Tag>
                  <Text strong>{sel.author || "—"}</Text>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {sel.date ? dayjs(sel.date).format("YYYY-MM-DD HH:mm:ss") : "—"}
                  </Text>
                </div>
                <Paragraph style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>
                  {sel.message || t("（无提交说明）")}
                </Paragraph>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t("变更路径（{0}）", sel.changedPaths.length)}
                </Text>
                <ul style={{ margin: "6px 0 0", paddingLeft: 4, listStyle: "none", fontSize: 12 }}>
                  {sel.changedPaths.map((p, i) => (
                    <li key={i} style={{ marginBottom: 4, wordBreak: "break-all" }}>
                      <Tag style={{ fontFamily: "monospace", marginInlineEnd: 6 }}>{p.action}</Tag>
                      {p.path}
                      {p.copyfromPath && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {" "}
                          ({t("来自 {0}@{1}", p.copyfromPath, p.copyfromRev ?? "")})
                        </Text>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Text type="secondary">{t("点击图中节点或修订号查看详情")}</Text>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
