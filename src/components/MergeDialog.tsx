// 将某个分支/标签 URL 合并进当前工作副本（svn merge）。
// 合并结果原样展示；出现冲突时高亮提示，引导到状态表逐个解决。

import { useEffect, useState } from "react";
import { Alert, Collapse, Input, Modal, Space, Typography, message } from "antd";
import * as svnApi from "../api/svn";
import { t } from "../i18n";
import type { SvnError } from "../api/svn";
import type { AuthInput, MergeResult } from "../types";

const { Text } = Typography;

export function MergeDialog({
  open,
  wcPath,
  onClose,
  onMerged,
}: {
  open: boolean;
  wcPath: string;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [currentUrl, setCurrentUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [revRange, setRevRange] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [authOpen, setAuthOpen] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SvnError | null>(null);
  const [result, setResult] = useState<MergeResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setResult(null);
    setSourceUrl("");
    setRevRange("");
    svnApi
      .getInfo(wcPath)
      .then((info) => setCurrentUrl(info.url))
      .catch((e) => setError(e as SvnError));
  }, [open, wcPath]);

  async function doMerge() {
    if (!sourceUrl.trim()) {
      message.warning(t("请填写合并来源 URL"));
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const auth: AuthInput = {
        username: username || undefined,
        password: password || undefined,
        remember: remember && !!username && !!password,
      };
      const res = await svnApi.mergeInto(
        wcPath,
        sourceUrl.trim(),
        revRange.trim() || null,
        auth,
      );
      setResult(res);
      onMerged();
      if (res.hasConflicts) {
        message.warning(t("合并完成，但存在冲突，请在文件列表中解决"));
      } else {
        message.success(t("合并完成"));
      }
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
      title={t("合并到工作副本")}
      open={open}
      onCancel={onClose}
      onOk={() => void doMerge()}
      okText={t("合并")}
      confirmLoading={loading}
      width={680}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t("当前工作副本 URL")}
          </Text>
          <Input value={currentUrl} readOnly />
        </div>

        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t("合并来源 URL（要合并进来的分支/标签）")}
          </Text>
          <Input
            placeholder="https://svn.example.com/repo/branches/feature-x"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
          />
        </div>

        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t("修订范围（可选，如 100:200 或 150；留空合并全部未合并修订）")}
          </Text>
          <Input
            placeholder={t("留空 = 自动（eligible）")}
            value={revRange}
            onChange={(e) => setRevRange(e.target.value)}
          />
        </div>

        {error && (
          <Alert type="error" showIcon message={error.code} description={error.message} />
        )}

        {result && (
          <Alert
            type={result.hasConflicts ? "warning" : "success"}
            showIcon
            message={result.hasConflicts ? t("合并完成，存在冲突") : t("合并完成")}
            description={
              <pre className="merge-output">{result.output || t("（无输出）")}</pre>
            }
          />
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
