// svn 相关的 Tauri 命令处理器。薄封装：参数校验 + 调用 svn 引擎 + 返回结构化结果。
// 所有 Err 都是 SvnError，前端按 code 分支处理。

use crate::svn::{self, FileDiff, LogEntry, StatusEntry, SvnError, SvnInfo, WorkingCopyInfo};

use super::config_cmd;

/// 探测 svn 二进制与版本。
#[tauri::command]
pub fn detect_svn() -> Result<SvnInfo, SvnError> {
    svn::detect()
}

/// 读取工作副本状态列表。
#[tauri::command]
pub async fn get_status(path: String) -> Result<Vec<StatusEntry>, SvnError> {
    svn::status(&path).await
}

/// 轻量获取工作副本改动文件数（侧栏角标用，不解析完整 XML）。
#[tauri::command]
pub async fn get_status_count(path: String) -> Result<usize, SvnError> {
    svn::status_count(&path).await
}

/// 读取工作副本信息。
#[tauri::command]
pub async fn get_info(path: String) -> Result<WorkingCopyInfo, SvnError> {
    svn::info(&path).await
}

/// 校验路径是否为有效工作副本。
#[tauri::command]
pub async fn is_working_copy(path: String) -> Result<bool, SvnError> {
    Ok(svn::is_working_copy(&path).await)
}

/// 执行 update，返回更新后的修订号。
#[tauri::command]
pub async fn update_working_copy(path: String) -> Result<i64, SvnError> {
    svn::update(&path).await
}

/// 提交选中文件，返回新修订号；成功后把提交信息记入历史。
#[tauri::command]
pub async fn commit_files(
    path: String,
    files: Vec<String>,
    message: String,
) -> Result<i64, SvnError> {
    let rev = svn::commit(&path, &files, &message).await?;
    config_cmd::remember_message(&message);
    Ok(rev)
}

/// 把未版本化文件加入版本控制。
#[tauri::command]
pub async fn add_files(path: String, files: Vec<String>) -> Result<(), SvnError> {
    svn::add(&path, &files).await
}

/// 删除文件：versioned 走 svn delete，unversioned 直接删文件系统。
#[tauri::command]
pub async fn delete_files(
    path: String,
    versioned: Vec<String>,
    unversioned: Vec<String>,
) -> Result<(), SvnError> {
    svn::delete(&path, &versioned, &unversioned).await
}

/// 还原本地改动。
#[tauri::command]
pub async fn revert_files(path: String, files: Vec<String>) -> Result<(), SvnError> {
    svn::revert(&path, &files).await
}

/// 读取单文件的 BASE / 工作区内容，供双栏 diff。
#[tauri::command]
pub async fn get_file_diff(path: String, file: String) -> Result<FileDiff, SvnError> {
    svn::file_diff(&path, &file).await
}

/// 分页读取提交日志。
#[tauri::command]
pub async fn get_log(
    path: String,
    limit: u32,
    before_rev: Option<i64>,
) -> Result<Vec<LogEntry>, SvnError> {
    svn::log(&path, limit, before_rev).await
}
