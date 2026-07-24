// 前后端共享的数据结构定义，与 Rust 侧的 serde 结构保持一致

/** svn 二进制探测结果 */
export interface SvnInfo {
  path: string;
  version: string; // 例如 "1.14.5"
}

/** 单个文件的工作副本状态 */
export interface StatusEntry {
  path: string; // 相对工作副本根的路径
  /** 工作副本本身的状态码 */
  itemStatus: StatusKind;
  /** 属性状态 */
  propStatus: StatusKind;
  /** 是否被版本控制 */
  versioned: boolean;
  /** 是否有远端更新（status -u 时才有意义） */
  remoteChanged: boolean;
  /** 是否为副本（copied） */
  copied: boolean;
  /** 本地修订号，未知时为 null */
  revision: number | null;
}

/** svn status 的状态种类，对应 svn 的单字符码 */
export type StatusKind =
  | "normal"
  | "modified"
  | "added"
  | "deleted"
  | "unversioned"
  | "missing"
  | "conflicted"
  | "ignored"
  | "replaced"
  | "external"
  | "incomplete"
  | "none";

/** 工作副本的基本信息（svn info） */
export interface WorkingCopyInfo {
  url: string;
  repositoryRoot: string;
  revision: number;
  relativeUrl: string;
}

/** 前端持久化的工作副本条目 */
export interface WorkingCopy {
  id: string; // 稳定标识（路径哈希）
  name: string; // 显示名（目录名）
  path: string; // 本地绝对路径
}
