// 文件右键菜单的共享逻辑：菜单项构建 + 动作执行。
// FileStatusTable(列表视图)与 FileTreeView(树视图)共用,保证两边菜单一致。

import { useState } from "react";
import { Modal, message } from "antd";
import type { MenuProps } from "antd";
import {
  DiffOutlined,
  PlusOutlined,
  RollbackOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  StopOutlined,
  CheckCircleOutlined,
  FileSearchOutlined,
} from "@ant-design/icons";
import { useAppStore } from "../stores/appStore";
import * as svnApi from "../api/svn";
import { showSvnError } from "../utils/errorDialog";
import { t } from "../i18n";
import type { StatusEntry } from "../types";

/** 可「还原」的状态 */
export const REVERTABLE = new Set(["modified", "added", "deleted", "replaced", "missing", "conflicted"]);

/**
 * 按条目状态动态生成右键菜单项。
 * isDir：树视图知道节点是否为目录（目录没有文本差异/blame）；
 * 列表视图无法区分（svn status 不带 kind），不传即按文件处理，维持原行为。
 */
export function fileMenuItems(entry: StatusEntry, opts?: { isDir?: boolean }): MenuProps["items"] {
  const isDir = opts?.isDir ?? false;
  const items: MenuProps["items"] = [];
  // 目录没有文本差异；干净条目（树视图的未改动文件）没有可看的差异
  if (!isDir && entry.itemStatus !== "normal" && entry.itemStatus !== "none") {
    items.push({ key: "diff", label: t("显示差异"), icon: <DiffOutlined /> });
  }
  // 冲突文件：优先展示解决入口
  if (entry.itemStatus === "conflicted") {
    items.push({
      key: "resolve",
      label: t("解决冲突"),
      icon: <CheckCircleOutlined />,
      children: [
        { key: "resolve:working", label: t("保留当前内容（working）") },
        { key: "resolve:mine-full", label: t("采用我的（mine-full）") },
        { key: "resolve:theirs-full", label: t("采用对方的（theirs-full）") },
      ],
    });
  }
  if (entry.itemStatus === "unversioned") {
    items.push({ key: "add", label: t("加入版本控制"), icon: <PlusOutlined /> });
    items.push({ key: "ignore", label: t("加入忽略列表"), icon: <StopOutlined /> });
  }
  if (REVERTABLE.has(entry.itemStatus)) {
    items.push({ key: "revert", label: t("还原改动"), icon: <RollbackOutlined /> });
  }
  // blame 仅对版本化的文件有意义
  if (!isDir && entry.versioned && entry.itemStatus !== "deleted" && entry.itemStatus !== "missing") {
    items.push({ key: "blame", label: t("Blame 注释"), icon: <FileSearchOutlined /> });
  }
  // 已删除/丢失的文件磁盘上不存在，无法在 Finder 中显示
  if (entry.itemStatus !== "deleted" && entry.itemStatus !== "missing") {
    items.push({ key: "reveal", label: t("在 Finder 中显示"), icon: <FolderOpenOutlined /> });
  }
  items.push({ type: "divider" });
  items.push({ key: "delete", label: t("删除"), icon: <DeleteOutlined />, danger: true });
  return items;
}

/**
 * 右键菜单动作执行：返回 runAction 与 Blame 弹窗状态。
 * BlameModal 由调用方渲染（blameFile 非空时打开，onClose 用 closeBlame）。
 */
export function useFileActions(wcPath: string | null) {
  const selectFile = useAppStore((s) => s.selectFile);
  const refreshStatus = useAppStore((s) => s.refreshStatus);
  const [blameFile, setBlameFile] = useState<string | null>(null);

  async function runAction(key: string, entry: StatusEntry) {
    if (!wcPath) return;
    try {
      if (key === "diff") {
        selectFile(entry);
      } else if (key.startsWith("resolve:")) {
        const accept = key.slice("resolve:".length);
        await svnApi.resolveConflicts(wcPath, [entry.path], accept);
        message.success(t("已解决冲突：{0}", entry.path));
        await refreshStatus();
      } else if (key === "blame") {
        setBlameFile(entry.path);
      } else if (key === "ignore") {
        await svnApi.addToIgnore(wcPath, entry.path);
        message.success(t("已加入忽略：{0}", entry.path));
        await refreshStatus();
      } else if (key === "reveal") {
        await svnApi.revealInFinder(`${wcPath}/${entry.path}`);
      } else if (key === "add") {
        await svnApi.addFiles(wcPath, [entry.path]);
        message.success(t("已加入版本控制：{0}", entry.path));
        await refreshStatus();
      } else if (key === "revert") {
        Modal.confirm({
          title: t("还原改动？"),
          content: t("将丢弃 {0} 的本地改动，且不可恢复。", entry.path),
          okText: t("还原"),
          okButtonProps: { danger: true },
          cancelText: t("取消"),
          async onOk() {
            try {
              await svnApi.revertFiles(wcPath, [entry.path]);
              message.success(t("已还原：{0}", entry.path));
              await refreshStatus();
            } catch (e) {
              showSvnError(e, t("还原失败"));
            }
          },
        });
      } else if (key === "delete") {
        const unversioned = entry.itemStatus === "unversioned";
        Modal.confirm({
          title: t("删除文件？"),
          content: unversioned
            ? t("{0} 未受版本控制，将直接从磁盘删除，不可恢复。", entry.path)
            : t("{0} 将被 svn delete（本地立即删除，提交后从仓库移除）。", entry.path),
          okText: t("删除"),
          okButtonProps: { danger: true },
          cancelText: t("取消"),
          async onOk() {
            try {
              await svnApi.deleteFiles(
                wcPath,
                unversioned ? [] : [entry.path],
                unversioned ? [entry.path] : [],
              );
              message.success(t("已删除：{0}", entry.path));
              await refreshStatus();
            } catch (e) {
              showSvnError(e, t("删除失败"));
            }
          },
        });
      }
    } catch (e) {
      showSvnError(e);
    }
  }

  return { runAction, blameFile, closeBlame: () => setBlameFile(null) };
}
