// svn 错误码 → 用户可读的统一错误对话框。
// 未识别的 code 落到通用标题，message 原样展示。

import { Modal } from "antd";
import type { SvnError } from "../api/svn";

const TITLES: Record<string, string> = {
  E170001: "认证失败",
  E170013: "无法连接到仓库",
  E175002: "网络或仓库连接异常",
  E175013: "访问被拒绝",
  E155004: "工作副本被锁定（需要 cleanup）",
  E155007: "该路径不是工作副本",
  E155015: "存在未解决的冲突",
  E160013: "路径在仓库中不存在",
  E160028: "文件已过期，请先更新",
  E200009: "目标不存在或类型不符",
  E230001: "服务器证书不受信任",
  SVN_NOT_FOUND: "未找到 svn 命令",
  NOT_WORKING_COPY: "不是有效的工作副本",
  BINARY_FILE: "二进制文件",
  BAD_PATH: "非法路径",
  EMPTY_COMMIT: "没有可提交的内容",
  INTERNAL: "内部错误",
};

/** 弹出统一的 svn 错误对话框。 */
export function showSvnError(e: unknown, fallbackTitle = "操作失败") {
  const err = e as Partial<SvnError>;
  const title = (err.code && TITLES[err.code]) || fallbackTitle;
  const content = err.message ?? String(e);
  Modal.error({ title, content, width: 520 });
}
