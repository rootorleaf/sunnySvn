// 提交对话框：勾选文件 + 提交信息（支持历史信息复用）。
// 勾选了未版本化文件时先自动 add 再 commit。

import { useEffect, useMemo, useState } from "react";
import { Checkbox, Input, Modal, Select, Space, Tag, Typography, message } from "antd";
import { useAppStore } from "../stores/appStore";
import * as svnApi from "../api/svn";
import * as configApi from "../api/config";
import { showSvnError } from "../utils/errorDialog";
import type { StatusEntry } from "../types";

const { Text } = Typography;

/** 可直接提交的状态 */
const COMMITTABLE = new Set(["modified", "added", "deleted", "replaced"]);

const STATUS_TAG: Record<string, { label: string; color: string }> = {
  modified: { label: "M", color: "orange" },
  added: { label: "A", color: "green" },
  deleted: { label: "D", color: "red" },
  replaced: { label: "R", color: "purple" },
  unversioned: { label: "?", color: "default" },
};

export function CommitDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const statusEntries = useAppStore((s) => s.statusEntries);
  const selectedId = useAppStore((s) => s.selectedId);
  const workingCopies = useAppStore((s) => s.workingCopies);
  const refreshStatus = useAppStore((s) => s.refreshStatus);
  const wcPath = workingCopies.find((w) => w.id === selectedId)?.path ?? null;

  // 候选文件：可提交状态 + 未版本化（勾选即先 add）
  const candidates = useMemo(
    () =>
      statusEntries.filter(
        (e) => COMMITTABLE.has(e.itemStatus) || e.itemStatus === "unversioned",
      ),
    [statusEntries],
  );

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 打开时初始化：默认勾选已版本化的改动，拉取历史提交信息
  useEffect(() => {
    if (!open) return;
    setChecked(
      new Set(candidates.filter((e) => COMMITTABLE.has(e.itemStatus)).map((e) => e.path)),
    );
    setMsg("");
    void configApi.listRecentMessages().then(setRecent).catch(() => setRecent([]));
    // candidates 随 statusEntries 变化，这里只在打开瞬间取一次初始勾选
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggle(path: string, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(path);
      else next.delete(path);
      return next;
    });
  }

  const allChecked = candidates.length > 0 && checked.size === candidates.length;

  async function handleOk() {
    if (!wcPath) return;
    const files = candidates.filter((e) => checked.has(e.path));
    const toAdd = files.filter((e) => e.itemStatus === "unversioned").map((e) => e.path);
    const paths = files.map((e) => e.path);
    setSubmitting(true);
    try {
      if (toAdd.length > 0) {
        await svnApi.addFiles(wcPath, toAdd);
      }
      const rev = await svnApi.commitFiles(wcPath, paths, msg.trim());
      message.success(`提交成功，修订 ${rev}`);
      await refreshStatus();
      onClose();
    } catch (e) {
      showSvnError(e, "提交失败");
      // add 成功但 commit 失败时文件保持已添加状态，刷新让用户看到真实状态
      await refreshStatus();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="提交"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="提交"
      cancelText="取消"
      okButtonProps={{ disabled: checked.size === 0 || !msg.trim(), loading: submitting }}
      width={640}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <div className="commit-file-list">
          <div className="commit-file-header">
            <Checkbox
              checked={allChecked}
              indeterminate={checked.size > 0 && !allChecked}
              onChange={(e) =>
                setChecked(
                  e.target.checked ? new Set(candidates.map((c) => c.path)) : new Set(),
                )
              }
            >
              全选（{checked.size}/{candidates.length}）
            </Checkbox>
          </div>
          <div className="commit-file-scroll">
            {candidates.map((entry: StatusEntry) => {
              const tag = STATUS_TAG[entry.itemStatus] ?? { label: "·", color: "default" };
              return (
                <div key={entry.path} className="commit-file-row">
                  <Checkbox
                    checked={checked.has(entry.path)}
                    onChange={(e) => toggle(entry.path, e.target.checked)}
                  >
                    <Tag color={tag.color} style={{ fontFamily: "monospace" }}>
                      {tag.label}
                    </Tag>
                    <Text style={{ fontSize: 12 }}>{entry.path}</Text>
                    {entry.itemStatus === "unversioned" && (
                      <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
                        （将先加入版本控制）
                      </Text>
                    )}
                  </Checkbox>
                </div>
              );
            })}
            {candidates.length === 0 && (
              <Text type="secondary" style={{ padding: 12, display: "block" }}>
                没有可提交的改动
              </Text>
            )}
          </div>
        </div>

        {recent.length > 0 && (
          <Select<string>
            placeholder="复用历史提交信息…"
            style={{ width: "100%" }}
            value={undefined}
            onSelect={(v) => setMsg(v)}
            options={recent.map((m) => ({ value: m, label: m }))}
          />
        )}
        <Input.TextArea
          rows={4}
          placeholder="提交信息（必填）"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
        />
      </Space>
    </Modal>
  );
}
