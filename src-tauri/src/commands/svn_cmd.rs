// svn 相关的 Tauri 命令处理器。薄封装：参数校验 + 调用 svn 引擎 + 返回结构化结果。
// 所有 Err 都是 SvnError，前端按 code 分支处理。

use crate::svn::{self, SvnError, SvnInfo, StatusEntry, WorkingCopyInfo};

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
