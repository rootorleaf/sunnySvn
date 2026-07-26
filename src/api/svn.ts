// Tauri IPC 的类型化封装：每个函数对应 src-tauri/src/commands 里的一个 handler。
// 前端只依赖这一层，不直接散落调用 invoke，便于统一错误处理与替换。

import { invoke } from "@tauri-apps/api/core";
import type {
  SvnInfo,
  StatusEntry,
  WorkingCopyInfo,
  FileDiff,
  LogEntry,
  RepoEntry,
  AuthInput,
} from "../types";

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

/** 提交选中文件（相对路径），返回新修订号 */
export function commitFiles(path: string, files: string[], message: string): Promise<number> {
  return call<number>("commit_files", { path, files, message });
}

/** 把未版本化文件加入版本控制 */
export function addFiles(path: string, files: string[]): Promise<void> {
  return call<void>("add_files", { path, files });
}

/** 删除文件：versioned 走 svn delete，unversioned 直接删文件系统 */
export function deleteFiles(
  path: string,
  versioned: string[],
  unversioned: string[],
): Promise<void> {
  return call<void>("delete_files", { path, versioned, unversioned });
}

/** 还原本地改动 */
export function revertFiles(path: string, files: string[]): Promise<void> {
  return call<void>("revert_files", { path, files });
}

/** 读取单文件 BASE / 工作区内容，供双栏 diff */
export function getFileDiff(path: string, file: string): Promise<FileDiff> {
  return call<FileDiff>("get_file_diff", { path, file });
}

/** 分页读取提交日志；beforeRev 传上一页最后一条的 revision - 1 */
export function getLog(path: string, limit: number, beforeRev?: number): Promise<LogEntry[]> {
  return call<LogEntry[]>("get_log", { path, limit, beforeRev: beforeRev ?? null });
}

/** 在 Finder 中显示指定路径（打开所在目录并选中） */
export function revealInFinder(path: string): Promise<void> {
  return call<void>("reveal_in_finder", { path });
}

/**
 * 把用户输入解析成可浏览的仓库 URL。
 * 若输入是本地工作副本路径（裸路径或 file://），返回其真实仓库 URL；
 * 否则返回 null（输入本身就是 URL，按原样用）。
 */
export function resolveRepoUrl(input: string): Promise<string | null> {
  return call<string | null>("resolve_repo_url", { input });
}

/** 浏览远端仓库目录（免 checkout） */
export function listRepo(url: string, auth: AuthInput = {}): Promise<RepoEntry[]> {
  return call<RepoEntry[]>("list_repo", { url, authInput: auth });
}

/** 开始 checkout，返回任务 id；进度与完成经事件推送 */
export function startCheckout(url: string, dest: string, auth: AuthInput = {}): Promise<number> {
  return call<number>("start_checkout", { url, dest, authInput: auth });
}

/** 取消进行中的长任务 */
export function cancelTask(taskId: number): Promise<boolean> {
  return call<boolean>("cancel_task", { taskId });
}

/** 查询某仓库已保存的凭据用户名（无则 null，不返回密码） */
export function getSavedCredential(url: string): Promise<string | null> {
  return call<string | null>("get_saved_credential", { url });
}

/** 删除某仓库保存的凭据 */
export function deleteSavedCredential(url: string): Promise<void> {
  return call<void>("delete_saved_credential", { url });
}
