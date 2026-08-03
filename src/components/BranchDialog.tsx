// 创建分支/标签：远端 copy。默认从工作副本当前 URL 出发，
// 推断 repoRoot 下的 branches/ 或 tags/ 作为目标父目录。

import { useEffect, useState } from "react";
import { Alert, Collapse, Input, Modal, Radio, Space, Typography, message } from "antd";
import * as svnApi from "../api/svn";
import { decodeSvnText } from "../utils/svnPath";
import { t } from "../i18n";
import type { SvnError } from "../api/svn";
import type { AuthInput } from "../types";

const { Text } = Typography;

export function BranchDialog({
  open,
  wcPath,
  onClose,
}: {
  open: boolean;
  wcPath: string;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<"branch" | "tag">("branch");
  const [srcUrl, setSrcUrl] = useState("");
  const [repoRoot, setRepoRoot] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [authOpen, setAuthOpen] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SvnError | null>(null);

  // 打开时读取工作副本当前 URL 作为源
  useEffect(() => {
    if (!open) return;
    setError(null);
    setName("");
    setMsg("");
    svnApi
      .getInfo(wcPath)
      .then((info) => {
        // 解码百分号编码，中文路径可读；svn 命令接受未编码 UTF-8 URL
        setSrcUrl(decodeSvnText(info.url));
        setRepoRoot(decodeSvnText(info.repositoryRoot));
      })
      .catch((e) => setError(e as SvnError));
  }, [open, wcPath]);

  // 目标 URL：repoRoot/branches/<name> 或 repoRoot/tags/<name>
  const parentDir = kind === "branch" ? "branches" : "tags";
  const dstUrl =
    repoRoot && name ? `${repoRoot.replace(/\/+$/, "")}/${parentDir}/${name}` : "";

  async function handleOk() {
    if (!srcUrl || !dstUrl) {
      message.warning(t("请填写名称"));
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
      const finalMsg =
        msg.trim() || t(kind === "branch" ? "创建分支 {0}" : "创建标签 {0}", name);
      const rev = await svnApi.createBranch(srcUrl, dstUrl, finalMsg, auth);
      message.success(t("已创建，修订 {0}", rev));
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
      title={t("创建分支 / 标签")}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText={t("创建")}
      confirmLoading={loading}
      width={640}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <Radio.Group value={kind} onChange={(e) => setKind(e.target.value)}>
          <Radio.Button value="branch">{t("分支 (branches)")}</Radio.Button>
          <Radio.Button value="tag">{t("标签 (tags)")}</Radio.Button>
        </Radio.Group>

        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t("源 URL（工作副本当前位置）")}
          </Text>
          <Input value={srcUrl} onChange={(e) => setSrcUrl(e.target.value)} />
        </div>

        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t(kind === "branch" ? "分支名称" : "标签名称")}
          </Text>
          <Input
            placeholder={kind === "branch" ? t("如 feature-x") : t("如 v1.0.0")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {dstUrl && (
          <Alert
            type="info"
            message={
              <Text style={{ fontSize: 12, wordBreak: "break-all" }}>{t("目标：{0}", dstUrl)}</Text>
            }
          />
        )}

        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t("提交信息")}
          </Text>
          <Input.TextArea
            rows={2}
            placeholder={t("留空则用默认信息")}
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
          />
        </div>

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
              label: t("认证（可选，留空自动使用钥匙串）"),
              children: (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Input
                    placeholder={t("用户名")}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                  <Input.Password
                    placeholder={t("密码")}
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
                    {t("记住到钥匙串")}
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
