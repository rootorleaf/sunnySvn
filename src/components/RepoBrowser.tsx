// 仓库浏览器：输入 URL 免 checkout 浏览远端目录，面包屑导航。
// 认证失败时展开认证栏；SSL 不受信确认后重试。

import { useState } from "react";
import {
  Alert,
  Breadcrumb,
  Button,
  Checkbox,
  Collapse,
  Input,
  Modal,
  Space,
  Table,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { FolderOutlined, FileOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import * as svnApi from "../api/svn";
import type { SvnError } from "../api/svn";
import type { RepoEntry } from "../types";

const { Text } = Typography;

function fmtSize(size: number | null): string {
  if (size == null) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function RepoBrowser({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rootUrl, setRootUrl] = useState("");
  /** 相对 rootUrl 的路径段（面包屑） */
  const [segments, setSegments] = useState<string[]>([]);
  const [entries, setEntries] = useState<RepoEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SvnError | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [authOpen, setAuthOpen] = useState<string[]>([]);

  const currentUrl = [rootUrl.replace(/\/+$/, ""), ...segments].join("/");

  async function browse(url: string, trustCert = false) {
    setLoading(true);
    setError(null);
    try {
      const list = await svnApi.listRepo(url, {
        username: username || undefined,
        password: password || undefined,
        remember: remember && !!username && !!password,
        trustCert,
      });
      // 目录在前，同类按名称排
      list.sort((a, b) =>
        a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1,
      );
      setEntries(list);
      setLoaded(true);
    } catch (e) {
      const err = e as SvnError;
      setError(err);
      if (err.code === "E170001" || err.code === "E215004") setAuthOpen(["auth"]);
    } finally {
      setLoading(false);
    }
  }

  async function enterRoot() {
    setSegments([]);
    let target = rootUrl.trim().replace(/\/+$/, "");
    // 用户可能填了本地工作副本路径：自动解析成其真实仓库 URL
    try {
      const resolved = await svnApi.resolveRepoUrl(target);
      if (resolved) {
        target = resolved.replace(/\/+$/, "");
        setRootUrl(target);
        message.info("已识别为工作副本，自动切换到其仓库地址");
      }
    } catch (e) {
      setError(e as SvnError);
      return;
    }
    void browse(target);
  }

  function enterDir(name: string) {
    const next = [...segments, name];
    setSegments(next);
    void browse([rootUrl.replace(/\/+$/, ""), ...next].join("/"));
  }

  function jumpTo(index: number) {
    // index = -1 表示根
    const next = index < 0 ? [] : segments.slice(0, index + 1);
    setSegments(next);
    void browse([rootUrl.replace(/\/+$/, ""), ...next].join("/"));
  }

  const sslBlocked = error?.code === "E230001";

  const columns: ColumnsType<RepoEntry> = [
    {
      title: "名称",
      dataIndex: "name",
      ellipsis: true,
      render: (name: string, row) =>
        row.kind === "dir" ? (
          <a onClick={() => enterDir(name)}>
            <FolderOutlined style={{ marginRight: 6 }} />
            {name}
          </a>
        ) : (
          <span>
            <FileOutlined style={{ marginRight: 6, color: "#999" }} />
            {name}
          </span>
        ),
    },
    { title: "修订", dataIndex: "revision", width: 70, align: "right" },
    { title: "作者", dataIndex: "author", width: 110, ellipsis: true },
    {
      title: "日期",
      dataIndex: "date",
      width: 140,
      render: (d: string) => (d ? dayjs(d).format("YYYY-MM-DD HH:mm") : "—"),
    },
    {
      title: "大小",
      dataIndex: "size",
      width: 90,
      align: "right",
      render: (s: number | null) => fmtSize(s),
    },
  ];

  return (
    <Modal
      title="仓库浏览器"
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
      width={800}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <Space.Compact style={{ width: "100%" }}>
          <Input
            placeholder="仓库 URL，或本地工作副本路径（自动解析）"
            value={rootUrl}
            onChange={(e) => setRootUrl(e.target.value)}
            onPressEnter={() => void enterRoot()}
          />
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            loading={loading}
            disabled={!rootUrl.trim()}
            onClick={() => void enterRoot()}
          >
            浏览
          </Button>
        </Space.Compact>

        {error && !sslBlocked && (
          <Alert type="error" showIcon message={error.code} description={error.message} />
        )}
        {sslBlocked && (
          <Alert
            type="warning"
            showIcon
            message="服务器证书不受信任"
            description={
              <Space direction="vertical">
                <Text style={{ fontSize: 12 }}>{error?.message}</Text>
                <Button size="small" type="primary" onClick={() => void browse(currentUrl, true)}>
                  信任该证书并重试
                </Button>
              </Space>
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
                  <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)}>
                    记住到钥匙串
                  </Checkbox>
                </Space>
              ),
            },
          ]}
        />

        {loaded && (
          <>
            <Breadcrumb
              items={[
                {
                  title: <a onClick={() => jumpTo(-1)}>根目录</a>,
                },
                ...segments.map((seg, i) => ({
                  title:
                    i === segments.length - 1 ? (
                      <span>{seg}</span>
                    ) : (
                      <a onClick={() => jumpTo(i)}>{seg}</a>
                    ),
                })),
              ]}
            />
            <Table<RepoEntry>
              rowKey="name"
              size="small"
              columns={columns}
              dataSource={entries}
              loading={loading}
              pagination={false}
              scroll={{ y: 360 }}
              locale={{ emptyText: "空目录" }}
            />
          </>
        )}
      </Space>
    </Modal>
  );
}
