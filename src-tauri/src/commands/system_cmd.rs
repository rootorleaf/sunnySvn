// 系统集成命令：Finder 显示、工作副本文件监控开关。

use crate::svn::SvnError;
use crate::watcher;

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

/// 开始监控某工作副本目录：本地文件变动经防抖后推送 `wc-changed` 事件。
/// 切换工作副本时前端调用，自动替换上一个监控。
#[tauri::command]
pub fn watch_working_copy(app: tauri::AppHandle, path: String) -> Result<(), SvnError> {
    watcher::watch(app, &path).map_err(SvnError::internal)
}

/// 停止当前文件监控（前端无选中工作副本或移除时调用）。
#[tauri::command]
pub fn unwatch_working_copy() {
    watcher::unwatch();
}
