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
