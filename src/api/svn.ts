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
  BlameLine,
  SvnProperty,
  MergeResult,
  FsEntry,
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

/** 轻量获取工作副本改动文件数（侧栏角标用） */
export function getStatusCount(path: string): Promise<number> {
  return call<number>("get_status_count", { path });
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

/** 整仓库日志（以仓库根为目标，含 copyfrom 信息），修订版本图用 */
export function getRepoLog(path: string, limit: number): Promise<LogEntry[]> {
  return call<LogEntry[]>("get_repo_log", { path, limit });
}

/** 在 Finder 中显示指定路径（打开所在目录并选中） */
export function revealInFinder(path: string): Promise<void> {
  return call<void>("reveal_in_finder", { path });
}

/** 列出工作副本内某相对目录的直接子项（跳过 .svn；文件树懒加载用） */
export function listDir(wcPath: string, relPath: string): Promise<FsEntry[]> {
  return call<FsEntry[]>("list_dir", { wcPath, relPath });
}

/** 开始监控某工作副本目录，本地文件变动经防抖后推送 wc-changed 事件 */
export function watchWorkingCopy(path: string): Promise<void> {
  return call<void>("watch_working_copy", { path });
}

/** 停止当前文件监控 */
export function unwatchWorkingCopy(): Promise<void> {
  return call<void>("unwatch_working_copy");
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

// ---- M3：分支/合并/冲突/blame/属性/远端操作 ----

/** 创建分支或标签（远端 copy），返回新修订号 */
export function createBranch(
  src: string,
  dst: string,
  message: string,
  auth: AuthInput = {},
): Promise<number> {
  return call<number>("create_branch", { src, dst, message, authInput: auth });
}

/** 切换工作副本到另一分支/标签 URL，返回切换后的修订号 */
export function switchWc(path: string, url: string, auth: AuthInput = {}): Promise<number> {
  return call<number>("switch_wc", { path, url, authInput: auth });
}

/** 将 sourceUrl 合并进工作副本；revisionRange 可选（如 "100:200"） */
export function mergeInto(
  path: string,
  sourceUrl: string,
  revisionRange: string | null,
  auth: AuthInput = {},
): Promise<MergeResult> {
  return call<MergeResult>("merge_into", { path, sourceUrl, revisionRange, authInput: auth });
}

/** 标记冲突已解决（accept: mine-full / theirs-full / working / base 等） */
export function resolveConflicts(path: string, files: string[], accept: string): Promise<void> {
  return call<void>("resolve_conflicts", { path, files, accept });
}

/** 读取文件逐行 blame */
export function getBlame(path: string, file: string): Promise<BlameLine[]> {
  return call<BlameLine[]>("get_blame", { path, file });
}

/** 列出路径上的属性（target 为 "." 表示工作副本根） */
export function getProplist(path: string, target: string): Promise<SvnProperty[]> {
  return call<SvnProperty[]>("get_proplist", { path, target });
}

/** 设置或删除属性（value 为空则删除） */
export function setProperty(
  path: string,
  target: string,
  name: string,
  value: string,
): Promise<void> {
  return call<void>("set_property", { path, target, name, value });
}

/** 右键「加入忽略」：把文件加入父目录 svn:ignore */
export function addToIgnore(path: string, file: string): Promise<void> {
  return call<void>("add_to_ignore", { path, file });
}

/** Cleanup 工作副本 */
export function cleanupWc(path: string): Promise<void> {
  return call<void>("cleanup_wc", { path });
}

/** 锁定文件 */
export function lockFiles(path: string, files: string[], message?: string): Promise<void> {
  return call<void>("lock_files", { path, files, message: message ?? null });
}

/** 解锁文件 */
export function unlockFiles(path: string, files: string[]): Promise<void> {
  return call<void>("unlock_files", { path, files });
}

/** 重定位工作副本到新仓库 URL */
export function relocateWc(
  path: string,
  fromUrl: string,
  toUrl: string,
  auth: AuthInput = {},
): Promise<void> {
  return call<void>("relocate_wc", { path, fromUrl, toUrl, authInput: auth });
}

/** 任意两个修订之间的 unified diff 文本 */
export function getRevDiff(
  path: string,
  file: string | null,
  rev1: number,
  rev2: number,
): Promise<string> {
  return call<string>("get_rev_diff", { path, file, rev1, rev2 });
}


/** 读取用户覆盖的 svn 路径（空字符串 = 用自动探测结果） */
export function getSvnPathOverride(): Promise<string> {
  return call<string>("get_svn_path_override");
}

/** 设置 svn 路径覆盖；空字符串清除覆盖，恢复自动探测 */
export function setSvnPathOverride(path: string): Promise<string> {
  return call<string>("set_svn_path_override", { path });
}
