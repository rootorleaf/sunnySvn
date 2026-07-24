// Tauri IPC 的类型化封装：每个函数对应 src-tauri/src/commands 里的一个 handler。
// 前端只依赖这一层，不直接散落调用 invoke，便于统一错误处理与替换。

import { invoke } from "@tauri-apps/api/core";
import type { SvnInfo, StatusEntry, WorkingCopyInfo } from "../types";

/** 后端返回的结构化错误 */
export interface SvnError {
  code: string; // 例如 "E170001"、"SVN_NOT_FOUND"
  message: string;
}

/** 统一包裹 invoke，把后端抛出的错误转成 SvnError */
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    // Tauri 把 Rust Err(String/结构体) 原样抛到这里
    if (e && typeof e === "object" && "code" in e) {
      throw e as SvnError;
    }
    throw { code: "UNKNOWN", message: String(e) } as SvnError;
  }
}

/** 探测 svn 二进制是否可用及其版本 */
export function detectSvn(): Promise<SvnInfo> {
  return call<SvnInfo>("detect_svn");
}

/** 读取指定工作副本的文件状态列表 */
export function getStatus(path: string): Promise<StatusEntry[]> {
  return call<StatusEntry[]>("get_status", { path });
}

/** 读取工作副本基本信息（URL / 修订号等） */
export function getInfo(path: string): Promise<WorkingCopyInfo> {
  return call<WorkingCopyInfo>("get_info", { path });
}

/** 校验某个本地路径是否为有效的 svn 工作副本 */
export function isWorkingCopy(path: string): Promise<boolean> {
  return call<boolean>("is_working_copy", { path });
}

/** 执行 update，返回更新后的修订号 */
export function updateWorkingCopy(path: string): Promise<number> {
  return call<number>("update_working_copy", { path });
}
