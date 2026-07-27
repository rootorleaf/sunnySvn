// M3 命令：分支/标签(remote copy)、switch、merge、冲突解决、blame、属性、
// cleanup/lock/unlock/relocate、任意两版本 diff。
// 远端写操作复用 remote_cmd 的认证辅助（resolve_auth / maybe_remember）。

use crate::svn::{self, BlameLine, MergeResult, SvnError, SvnProperty};

use super::remote_cmd::{maybe_remember, resolve_auth, AuthInput};

/// 创建分支或标签：远端 copy（src URL → dst URL），返回新修订号。
#[tauri::command]
pub async fn create_branch(
    src: String,
    dst: String,
    message: String,
    auth_input: AuthInput,
) -> Result<i64, SvnError> {
    let opts = resolve_auth(&src, &auth_input);
    let rev = svn::remote_copy(&src, &dst, &message, &opts).await?;
    maybe_remember(&src, &auth_input);
    Ok(rev)
}

/// 切换工作副本到另一分支/标签 URL，返回切换后的修订号。
#[tauri::command]
pub async fn switch_wc(
    path: String,
    url: String,
    auth_input: AuthInput,
) -> Result<i64, SvnError> {
    let opts = resolve_auth(&url, &auth_input);
    let rev = svn::switch(&path, &url, &opts).await?;
    maybe_remember(&url, &auth_input);
    Ok(rev)
}

/// 将 source_url 合并进工作副本。
#[tauri::command]
pub async fn merge_into(
    path: String,
    source_url: String,
    revision_range: Option<String>,
    auth_input: AuthInput,
) -> Result<MergeResult, SvnError> {
    let opts = resolve_auth(&source_url, &auth_input);
    let result = svn::merge(&path, &source_url, revision_range.as_deref(), &opts).await?;
    maybe_remember(&source_url, &auth_input);
    Ok(result)
}

/// 标记冲突已解决。accept: mine-full / theirs-full / working / base 等。
#[tauri::command]
pub async fn resolve_conflicts(
    path: String,
    files: Vec<String>,
    accept: String,
) -> Result<(), SvnError> {
    svn::resolve(&path, &files, &accept).await
}

/// 读取文件逐行 blame。
#[tauri::command]
pub async fn get_blame(path: String, file: String) -> Result<Vec<BlameLine>, SvnError> {
    svn::blame(&path, &file).await
}

/// 列出路径上的属性（target 为 "." 表示工作副本根）。
#[tauri::command]
pub async fn get_proplist(path: String, target: String) -> Result<Vec<SvnProperty>, SvnError> {
    svn::proplist(&path, &target).await
}

/// 设置或删除属性（value 为空则删除）。
#[tauri::command]
pub async fn set_property(
    path: String,
    target: String,
    name: String,
    value: String,
) -> Result<(), SvnError> {
    svn::propset(&path, &target, &name, &value).await
}

/// 右键「加入忽略」：把文件加入父目录 svn:ignore。
#[tauri::command]
pub async fn add_to_ignore(path: String, file: String) -> Result<(), SvnError> {
    svn::add_to_ignore(&path, &file).await
}

/// Cleanup 工作副本。
#[tauri::command]
pub async fn cleanup_wc(path: String) -> Result<(), SvnError> {
    svn::cleanup(&path).await
}

/// 锁定文件。
#[tauri::command]
pub async fn lock_files(
    path: String,
    files: Vec<String>,
    message: Option<String>,
) -> Result<(), SvnError> {
    svn::lock(&path, &files, message.as_deref()).await
}

/// 解锁文件。
#[tauri::command]
pub async fn unlock_files(path: String, files: Vec<String>) -> Result<(), SvnError> {
    svn::unlock(&path, &files).await
}

/// 重定位工作副本到新仓库 URL。
#[tauri::command]
pub async fn relocate_wc(
    path: String,
    from_url: String,
    to_url: String,
    auth_input: AuthInput,
) -> Result<(), SvnError> {
    let opts = resolve_auth(&to_url, &auth_input);
    svn::relocate(&path, &from_url, &to_url, &opts).await?;
    maybe_remember(&to_url, &auth_input);
    Ok(())
}

/// 任意两个修订之间的 unified diff 文本。
#[tauri::command]
pub async fn get_rev_diff(
    path: String,
    file: Option<String>,
    rev1: i64,
    rev2: i64,
) -> Result<String, SvnError> {
    svn::rev_diff(&path, file.as_deref(), rev1, rev2).await
}
