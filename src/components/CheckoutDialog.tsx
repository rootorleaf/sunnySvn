// Checkout 向导：URL + 目标目录 + 认证（可选，支持钥匙串记住）。
// 进度经 svn-task-progress 流式展示，可取消；
// E170001 → 展开认证栏重试；E230001 → 确认后带 trust_cert 重试。

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Collapse,
  Input,
  Modal,
  Space,
  Typography,
  message,
} from "antd";
import { FolderOpenOutlined } from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useAppStore } from "../stores/appStore";
import * as svnApi from "../api/svn";
import { decodeSvnText } from "../utils/svnPath";
import { t } from "../i18n";
import type { SvnError } from "../api/svn";
import type { TaskDone, TaskLine } from "../types";

const { Text } = Typography;

type Phase = "form" | "running" | "done";

export function CheckoutDialog({ open: visible, onClose }: { open: boolean; onClose: () => void }) {
  const addWorkingCopy = useAppStore((s) => s.addWorkingCopy);

  const [phase, setPhase] = useState<Phase>("form");
  const [url, setUrl] = useState("");
  const [dest, setDest] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [authOpen, setAuthOpen] = useState<string[]>([]);
  const [error, setError] = useState<SvnError | null>(null);
  const [savedUser, setSavedUser] = useState<string | null>(null);

  const [taskId, setTaskId] = useState<number | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const unlistenRef = useRef<UnlistenFn[]>([]);

  // 打开时重置
  useEffect(() => {
    if (visible) {
      setPhase("form");
      setError(null);
      setLines([]);
      setTaskId(null);
    }
  }, [visible]);

  // URL 变化时查钥匙串里是否已有凭据（提示用,不自动填密码）
  useEffect(() => {
    if (!url.includes("://")) {
      setSavedUser(null);
      return;
    }
    const timer = setTimeout(() => {
      svnApi.getSavedCredential(url).then(setSavedUser).catch(() => setSavedUser(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [url]);

  // 进度滚动到底
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // 订阅任务事件（打开期间常驻）
  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    const subs: UnlistenFn[] = [];
    void listen<TaskLine>("svn-task-progress", (e) => {
      setTaskId((current) => {
        if (current != null && e.payload.taskId === current) {
          setLines((prev) => [...prev.slice(-499), e.payload.line]);
        }
        return current;
      });
    }).then((u) => (disposed ? u() : subs.push(u)));
    void listen<TaskDone>("svn-task-done", (e) => {
      setTaskId((current) => {
        if (current == null || e.payload.taskId !== current) return current;
        if (e.payload.error) {
          handleTaskError(e.payload.error);
        } else {
          setPhase("done");
          message.success(t("Checkout 完成，修订 {0}", e.payload.revision ?? "?"));
          // 完成后自动加入工作副本列表
          void addWorkingCopy(e.payload.dest).catch(() => {
            /* 目标已在列表等非致命错误忽略 */
          });
          onClose();
        }
        return null;
      });
    }).then((u) => (disposed ? u() : subs.push(u)));
    unlistenRef.current = subs;
    return () => {
      disposed = true;
      subs.forEach((u) => u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleTaskError(err: { code: string; message: string }) {
    setPhase("form");
    setError(err as SvnError);
    if (err.code === "E170001" || err.code === "E215004") {
      // 认证失败：展开认证栏
      setAuthOpen(["auth"]);
    }
  }

  async function pickDest() {
    const selected = await open({ directory: true, multiple: false, title: t("选择存放目录") });
    if (typeof selected === "string") {
      // 目标 = 所选目录 + 仓库末段名（URL 编码的中文解码成真实文字，避免本地目录名变成 %E5%AE... 乱码）
      const rawName = url.replace(/\/+$/, "").split("/").pop() || "checkout";
      const repoName = decodeSvnText(rawName).replace(/\//g, "_");
      setDest(`${selected}/${repoName}`);
    }
  }

  async function start(trustCert = false) {
    setError(null);
    setLines([]);
    setPhase("running");
    try {
      const auth = {
        username: username || undefined,
        password: password || undefined,
        remember: remember && !!username && !!password,
        trustCert,
      };
      const id = await svnApi.startCheckout(url.trim(), dest.trim(), auth);
      setTaskId(id);
    } catch (e) {
      setPhase("form");
      setError(e as SvnError);
    }
  }

  async function cancel() {
    if (taskId != null) {
      await svnApi.cancelTask(taskId);
      // 结果由 svn-task-done 事件（CANCELLED）回来收尾
    }
  }

  const sslBlocked = error?.code === "E230001";
  const canStart = url.includes("://") && dest.startsWith("/");

  return (
    <Modal
      title={t("Checkout 仓库")}
      open={visible}
      onCancel={() => {
        if (phase === "running") {
          void cancel();
        }
        onClose();
      }}
      footer={
        phase === "running" ? (
          <Button danger onClick={() => void cancel()}>
            {t("取消 Checkout")}
          </Button>
        ) : (
          <Space>
            <Button onClick={onClose}>{t("关闭")}</Button>
            <Button type="primary" disabled={!canStart} onClick={() => void start(false)}>
              {t("开始 Checkout")}
            </Button>
          </Space>
        )
      }
      width={640}
      destroyOnClose
      maskClosable={phase !== "running"}
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        {error && !sslBlocked && (
          <Alert
            type="error"
            showIcon
            message={error.code}
            description={error.message}
            closable
            onClose={() => setError(null)}
          />
        )}
        {sslBlocked && (
          <Alert
            type="warning"
            showIcon
            message={t("服务器证书不受信任")}
            description={
              <Space direction="vertical">
                <Text style={{ fontSize: 12 }}>{error?.message}</Text>
                <Button size="small" type="primary" onClick={() => void start(true)}>
                  {t("信任该证书并重试")}
                </Button>
              </Space>
            }
          />
        )}

        <div>
          <Text strong>{t("仓库 URL")}</Text>
          <Input
            placeholder="https://svn.example.com/repo/trunk"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={phase === "running"}
            style={{ marginTop: 4 }}
          />
          {savedUser && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t("钥匙串已有该服务器的凭据（{0}），留空用户名将自动使用", savedUser)}
            </Text>
          )}
        </div>

        <div>
          <Text strong>{t("目标目录")}</Text>
          <Space.Compact style={{ width: "100%", marginTop: 4 }}>
            <Input
              placeholder="/Users/you/projects/repo"
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              disabled={phase === "running"}
            />
            <Button icon={<FolderOpenOutlined />} onClick={pickDest} disabled={phase === "running"}>
              {t("选择…")}
            </Button>
          </Space.Compact>
        </div>

        <Collapse
          size="small"
          activeKey={authOpen}
          onChange={(k) => setAuthOpen(k as string[])}
          items={[
            {
              key: "auth",
              label: t("认证（可选）"),
              children: (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Input
                    placeholder={t("用户名")}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={phase === "running"}
                  />
                  <Input.Password
                    placeholder={t("密码")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={phase === "running"}
                  />
                  <Checkbox
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    disabled={phase === "running"}
                  >
                    {t("记住到钥匙串")}
                  </Checkbox>
                </Space>
              ),
            },
          ]}
        />

        {phase === "running" && (
          <div className="checkout-progress" ref={scrollRef}>
            {lines.length === 0 ? (
              <Text type="secondary">{t("正在连接仓库…")}</Text>
            ) : (
              lines.map((l, i) => (
                <div key={i} className="checkout-progress-line">
                  {l}
                </div>
              ))
            )}
          </div>
        )}
      </Space>
    </Modal>
  );
}
