// 切换工作副本到另一分支/标签 URL（svn switch）。
// 打开时读取当前 URL 展示，并列出 repoRoot 下 branches/tags 供快速选择。

import { useEffect, useState } from "react";
import { Alert, Collapse, Input, List, Modal, Space, Tag, Typography, message } from "antd";
import { BranchesOutlined } from "@ant-design/icons";
import * as svnApi from "../api/svn";
import type { SvnError } from "../api/svn";
import type { AuthInput, RepoEntry } from "../types";

const { Text } = Typography;

export function SwitchDialog({
  open,
  wcPath,
  onClose,
  onSwitched,
}: {
  open: boolean;
  wcPath: string;
  onClose: () => void;
  onSwitched: () => void;
}) {
  const [currentUrl, setCurrentUrl] = useState("");
  const [target, setTarget] = useState("");
  const [candidates, setCandidates] = useState<{ label: string; url: string }[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [authOpen, setAuthOpen] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SvnError | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTarget("");
    setCandidates([]);
    svnApi
      .getInfo(wcPath)
      .then(async (info) => {
        setCurrentUrl(info.url);
        // 尝试列出 branches / tags 下的条目作为候选
        const root = info.repositoryRoot.replace(/\/+$/, "");
        const auth: AuthInput = {};
        const found: { label: string; url: string }[] = [];
        for (const dir of ["branches", "tags"]) {
          try {
            const list: RepoEntry[] = await svnApi.listRepo(`${root}/${dir}`, auth);
            for (const e of list.filter((x) => x.kind === "dir")) {
              found.push({ label: `${dir}/${e.name}`, url: `${root}/${dir}/${e.name}` });
            }
          } catch {
            // 该目录不存在或需认证，忽略；用户可手填 URL
          }
        }
        // trunk 也作为候选
        found.unshift({ label: "trunk", url: `${root}/trunk` });
        setCandidates(found);
      })
      .catch((e) => setError(e as SvnError));
  }, [open, wcPath]);

  async function doSwitch(url: string) {
    if (!url) {
      message.warning("请选择或填写目标 URL");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const auth: AuthInput = {
        username: username || undefined,
        password: password || undefined,
        remember: remember && !!username && !!password,
      };
      const rev = await svnApi.switchWc(wcPath, url, auth);
      message.success(`已切换到 ${url}，修订 ${rev}`);
      onSwitched();
      onClose();
    } catch (e) {
      const err = e as SvnError;
      setError(err);
      if (err.code === "E170001" || err.code === "E215004") setAuthOpen(["auth"]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="切换分支 / 标签"
      open={open}
      onCancel={onClose}
      onOk={() => void doSwitch(target)}
      okText="切换"
      confirmLoading={loading}
      width={640}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            当前 URL
          </Text>
          <Input value={currentUrl} readOnly />
        </div>

        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            目标 URL
          </Text>
          <Input
            placeholder="选择下方候选，或手动填写"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>

        {candidates.length > 0 && (
          <List
            size="small"
            bordered
            style={{ maxHeight: 200, overflow: "auto" }}
            dataSource={candidates}
            renderItem={(c) => (
              <List.Item
                style={{ cursor: "pointer", background: target === c.url ? "var(--selected-bg)" : undefined }}
                onClick={() => setTarget(c.url)}
                onDoubleClick={() => void doSwitch(c.url)}
              >
                <BranchesOutlined style={{ marginRight: 8, color: "var(--icon)" }} />
                <Text style={{ flex: 1 }}>{c.label}</Text>
                {currentUrl.replace(/\/+$/, "") === c.url && <Tag color="blue">当前</Tag>}
              </List.Item>
            )}
          />
        )}

        {error && (
          <Alert type="error" showIcon message={error.code} description={error.message} />
        )}

        <Collapse
          size="small"
          activeKey={authOpen}
          onChange={(k) => setAuthOpen(k as string[])}
          items={[
            {
              key: "auth",
              label: "认证（可选，留空自动使用钥匙串）",
              children: (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Input
                    placeholder="用户名"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                  <Input.Password
                    placeholder="密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <label style={{ fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      style={{ marginRight: 6 }}
                    />
                    记住到钥匙串
                  </label>
                </Space>
              ),
            },
          ]}
        />
      </Space>
    </Modal>
  );
}
