// 工作副本列表的持久化接口，对应 src-tauri/src/commands/config.rs。
// 实际存储在 ~/Library/Application Support/com.rootorleaf.sunnysvn/config.json，由 Rust 侧负责读写。

import { invoke } from "@tauri-apps/api/core";
import type { WorkingCopy } from "../types";

/** 读取已保存的工作副本列表 */
export function listWorkingCopies(): Promise<WorkingCopy[]> {
  return invoke<WorkingCopy[]>("list_working_copies");
}

/** 添加一个工作副本（后端会校验路径并生成稳定 id），返回更新后的完整列表 */
export function addWorkingCopy(path: string): Promise<WorkingCopy[]> {
  return invoke<WorkingCopy[]>("add_working_copy", { path });
}

/** 按 id 移除工作副本，返回更新后的完整列表 */
export function removeWorkingCopy(id: string): Promise<WorkingCopy[]> {
  return invoke<WorkingCopy[]>("remove_working_copy", { id });
}

/** 按 id 顺序重排工作副本（侧栏拖动排序后持久化），返回更新后的完整列表 */
export function reorderWorkingCopies(ids: string[]): Promise<WorkingCopy[]> {
  return invoke<WorkingCopy[]>("reorder_working_copies", { ids });
}

/** 读取最近使用的提交信息（新的在前，提交成功后由后端自动记录） */
export function listRecentMessages(): Promise<string[]> {
  return invoke<string[]>("list_recent_messages");
}
