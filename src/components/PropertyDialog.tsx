// svn 属性编辑：查看 / 增改 / 删除某路径上的属性（默认工作副本根 "."）。
// 常用于 svn:ignore、svn:externals。属性改动是本地修改，需 commit 才生效。

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  AutoComplete,
  Button,
  Input,
  List,
  Modal,
  Space,
  Typography,
  message,
} from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import * as svnApi from "../api/svn";
import type { SvnError } from "../api/svn";
import type { SvnProperty } from "../types";

const { Text } = Typography;

// 常用属性名，供 AutoComplete 提示
const COMMON_PROPS = [
  "svn:ignore",
  "svn:externals",
  "svn:keywords",
  "svn:eol-style",
  "svn:mime-type",
  "svn:executable",
  "svn:needs-lock",
];

export function PropertyDialog({
  open,
  wcPath,
  onClose,
}: {
  open: boolean;
  wcPath: string;
  onClose: () => void;
}) {
  // 编辑目标（相对路径，"." 为工作副本根）
  const [target, setTarget] = useState(".");
  const [props, setProps] = useState<SvnProperty[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SvnError | null>(null);

  // 增改表单
  const [editName, setEditName] = useState("");
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (t: string) => {
      setLoading(true);
      setError(null);
      try {
        const list = await svnApi.getProplist(wcPath, t || ".");
        setProps(list);
      } catch (e) {
        setError(e as SvnError);
        setProps([]);
      } finally {
        setLoading(false);
      }
    },
    [wcPath],
  );

  useEffect(() => {
    if (!open) return;
    setTarget(".");
    setEditName("");
    setEditValue("");
    void load(".");
  }, [open, load]);

  // 点某条属性 → 载入到编辑区
  function pick(p: SvnProperty) {
    setEditName(p.name);
    setEditValue(p.value);
  }

  async function save() {
    const name = editName.trim();
    if (!name) {
      message.warning("请填写属性名");
      return;
    }
    setSaving(true);
    try {
      await svnApi.setProperty(wcPath, target || ".", name, editValue);
      message.success(`已设置 ${name}（需 commit 后生效）`);
      setEditName("");
      setEditValue("");
      await load(target);
    } catch (e) {
      showError(e as SvnError);
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: SvnProperty) {
    Modal.confirm({
      title: "删除属性？",
      content: `将删除 ${p.name}（需 commit 后生效）。`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      async onOk() {
        try {
          // 值传空字符串 → 后端走 propdel
          await svnApi.setProperty(wcPath, target || ".", p.name, "");
          message.success(`已删除 ${p.name}`);
          await load(target);
        } catch (e) {
          showError(e as SvnError);
        }
      },
    });
  }

  function showError(e: SvnError) {
    setError(e);
  }

  return (
    <Modal
      title="属性编辑"
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
      width={680}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            目标路径（相对工作副本根，"." 表示根目录）
          </Text>
          <Space.Compact style={{ width: "100%" }}>
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onPressEnter={() => void load(target)}
              placeholder="."
            />
            <Button loading={loading} onClick={() => void load(target)}>
              读取
            </Button>
          </Space.Compact>
        </div>

        {error && (
          <Alert type="error" showIcon message={error.code} description={error.message} />
        )}

        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            已有属性（点击载入到下方编辑）
          </Text>
          <List
            size="small"
            bordered
            style={{ maxHeight: 180, overflow: "auto" }}
            dataSource={props}
            locale={{ emptyText: "该路径暂无属性" }}
            renderItem={(p) => (
              <List.Item
                style={{ cursor: "pointer" }}
                onClick={() => pick(p)}
                actions={[
                  <Button
                    key="del"
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(p);
                    }}
                  />,
                ]}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text strong style={{ fontFamily: "monospace" }}>
                    {p.name}
                  </Text>
                  <div>
                    <Text
                      type="secondary"
                      style={{ fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all" }}
                    >
                      {p.value || "（空值）"}
                    </Text>
                  </div>
                </div>
              </List.Item>
            )}
          />
        </div>

        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            新增 / 修改属性
          </Text>
          <Space direction="vertical" style={{ width: "100%" }} size={8}>
            <AutoComplete
              style={{ width: "100%" }}
              value={editName}
              onChange={(v) => setEditName(v)}
              options={COMMON_PROPS.map((p) => ({ value: p }))}
              placeholder="属性名，如 svn:ignore"
              filterOption={(input, option) =>
                (option?.value ?? "").toLowerCase().includes(input.toLowerCase())
              }
            />
            <Input.TextArea
              rows={4}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="属性值（svn:ignore 每行一个模式）"
            />
            <Space>
              <Button type="primary" loading={saving} onClick={() => void save()}>
                保存属性
              </Button>
              <Text type="secondary" style={{ fontSize: 12 }}>
                属性改动为本地修改，需在提交后生效
              </Text>
            </Space>
          </Space>
        </div>
      </Space>
    </Modal>
  );
}
