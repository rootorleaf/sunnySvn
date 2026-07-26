// 系统集成命令：目前只有 Finder 相关。

use crate::svn::SvnError;

/// 在 Finder 中显示指定路径（macOS `open -R`：打开所在目录并选中该项）。
#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), SvnError> {
    if !std::path::Path::new(&path).exists() {
        return Err(SvnError::new("NOT_FOUND", format!("路径不存在: {path}")));
    }
    let status = std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .status()
        .map_err(|e| SvnError::internal(format!("无法调用 open: {e}")))?;
    if status.success() {
        Ok(())
    } else {
        Err(SvnError::internal("open -R 执行失败"))
    }
}
