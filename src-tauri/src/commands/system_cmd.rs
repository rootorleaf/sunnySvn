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

/// 目录列表条目（文件树懒加载用）。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub is_dir: bool,
}

/// 列出工作副本内某相对目录的直接子项（跳过 .svn），目录在前、按名称排序。
/// 供前端文件树按需展开完整目录结构。
#[tauri::command]
pub fn list_dir(wc_path: String, rel_path: String) -> Result<Vec<FsEntry>, SvnError> {
    // 与 svn 命令同样的相对路径安全校验：拒绝绝对路径与 ..
    if rel_path.starts_with('/') || rel_path.split('/').any(|seg| seg == "..") {
        return Err(SvnError::new("BAD_PATH", format!("非法路径: {rel_path}")));
    }
    let mut dir = std::path::PathBuf::from(&wc_path);
    if !rel_path.is_empty() {
        dir.push(&rel_path);
    }
    let read = std::fs::read_dir(&dir)
        .map_err(|e| SvnError::new("NOT_FOUND", format!("无法读取目录 {}: {e}", dir.display())))?;
    let mut entries: Vec<FsEntry> = Vec::new();
    for item in read.flatten() {
        let name = item.file_name().to_string_lossy().to_string();
        if name == ".svn" {
            continue;
        }
        // is_dir 跟随符号链接；坏链接按文件处理
        let is_dir = item.path().is_dir();
        entries.push(FsEntry { name, is_dir });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}
