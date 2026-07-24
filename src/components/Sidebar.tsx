import { useState } from "react";
import { Button, List, Typography, Popconfirm, message } from "antd";
import { PlusOutlined, DeleteOutlined, FolderOutlined } from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../stores/appStore";
import type { SvnError } from "../api/svn";

const { Text } = Typography;

// 侧栏：工作副本列表 + 添加/移除。添加时用系统目录选择器，
// 后端会校验所选目录是否为有效 svn 工作副本。
export function Sidebar() {
  const workingCopies = useAppStore((s) => s.workingCopies);
  const selectedId = useAppStore((s) => s.selectedId);
  const selectWorkingCopy = useAppStore((s) => s.selectWorkingCopy);
  const addWorkingCopy = useAppStore((s) => s.addWorkingCopy);
  const removeWorkingCopy = useAppStore((s) => s.removeWorkingCopy);
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    const selected = await open({ directory: true, multiple: false, title: "选择 SVN 工作副本目录" });
    if (typeof selected !== "string") return;
    setAdding(true);
    try {
      await addWorkingCopy(selected);
    } catch (e) {
      const err = e as SvnError;
      message.error(
        err.code === "NOT_WORKING_COPY"
          ? "所选目录不是有效的 SVN 工作副本"
          : `添加失败：${err.message}`,
      );
    } finally {
      setAdding(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Text strong>工作副本</Text>
        <Button
          size="small"
          type="text"
          icon={<PlusOutlined />}
          loading={adding}
          onClick={handleAdd}
          title="添加工作副本"
        />
      </div>
      <List
        style={{ flex: 1, overflow: "auto" }}
        dataSource={workingCopies}
        locale={{ emptyText: "尚未添加工作副本" }}
        renderItem={(wc) => (
          <List.Item
            style={{
              padding: "8px 16px",
              cursor: "pointer",
              background: wc.id === selectedId ? "var(--selected-bg)" : undefined,
            }}
            onClick={() => selectWorkingCopy(wc.id)}
            actions={[
              <Popconfirm
                key="del"
                title="从列表移除？"
                description="仅从应用移除，不会删除本地文件。"
                onConfirm={(e) => {
                  e?.stopPropagation();
                  void removeWorkingCopy(wc.id);
                }}
                onCancel={(e) => e?.stopPropagation()}
              >
                <Button
                  size="small"
                  type="text"
                  icon={<DeleteOutlined />}
                  onClick={(e) => e.stopPropagation()}
                />
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              avatar={<FolderOutlined style={{ fontSize: 16, color: "var(--icon)" }} />}
              title={<Text ellipsis>{wc.name}</Text>}
              description={
                <Text type="secondary" ellipsis style={{ fontSize: 12 }}>
                  {wc.path}
                </Text>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );
}
