// svn 返回的 URL（svn info 等）对非 ASCII 字符做了百分号编码，
// 中文路径会显示成 %E5%AE... 乱码。显示前统一解码。
// svn CLI 接受未编码的 UTF-8 URL（内部自行编码），解码后的 URL 回传给命令仍然有效。

/** 百分号编码解码；无效序列（如名字里本来就带 %）原样返回。 */
export function decodeSvnText(s: string): string {
  if (!s.includes("%")) return s;
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
