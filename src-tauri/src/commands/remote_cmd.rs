// 远端与认证相关的 Tauri 命令：仓库浏览、checkout、凭据管理。
//
// 认证流转：前端传 remember=true 时，操作成功后把凭据写入钥匙串；
// 不传用户名密码时自动尝试钥匙串里按 realm 匹配的凭据。

use serde::Deserialize;

use crate::auth;
use crate::svn::{self, AuthOptions, RepoEntry, SvnError};

/// 前端传入的认证参数。
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthInput {
    pub username: Option<String>,
    pub password: Option<String>,
    /// 操作成功后是否把凭据存入钥匙串
    #[serde(default)]
    pub remember: bool,
    /// SSL 证书不受信（E230001）经用户确认后重试时传 true
    #[serde(default)]
    pub trust_cert: bool,
}

/// 组装 AuthOptions：显式传入优先，否则回落到钥匙串。
fn resolve_auth(url: &str, input: &AuthInput) -> AuthOptions {
    let mut opts = AuthOptions {
        username: input.username.clone(),
        password: input.password.clone(),
        trust_cert: input.trust_cert,
    };
    if opts.username.is_none() && opts.password.is_none() {
        if let Ok(realm) = auth::realm_of(url) {
            if let Ok(Some(cred)) = auth::load(&realm) {
                opts.username = Some(cred.username);
                opts.password = Some(cred.password);
            }
        }
    }
    opts
}

/// 操作成功后按需保存凭据。
fn maybe_remember(url: &str, input: &AuthInput) {
    if input.remember {
        if let (Some(u), Some(p)) = (&input.username, &input.password) {
            if let Ok(realm) = auth::realm_of(url) {
                let _ = auth::save(
                    &realm,
                    &auth::Credential {
                        username: u.clone(),
                        password: p.clone(),
                    },
                );
            }
        }
    }
}

/// 把用户输入解析成可浏览的仓库 URL。
///
/// 用户常把本地工作副本路径当仓库地址填（如 `/path/to/wc` 或 `file:///path/to/wc`），
/// 而工作副本不是仓库、无法用 file:// 浏览。这里检测这种情况，
/// 自动读出其真实仓库 URL（svn info 的 URL 字段）返回给前端引导切换。
///
/// 返回：`Some(真实URL)` 表示输入是工作副本、已解析；`None` 表示输入本身就是 URL，按原样用。
#[tauri::command]
pub async fn resolve_repo_url(input: String) -> Result<Option<String>, SvnError> {
    let trimmed = input.trim();

    // 取出本地路径候选：裸路径，或 file:// 指向的本地目录
    let local_path: Option<String> = if trimmed.starts_with('/') {
        Some(trimmed.to_string())
    } else if let Some(rest) = trimmed.strip_prefix("file://") {
        // file:///abs → /abs（去掉可能的 localhost 主机段）
        let p = rest.strip_prefix("localhost").unwrap_or(rest);
        Some(p.to_string())
    } else {
        None
    };

    if let Some(path) = local_path {
        // 该本地路径是工作副本吗？是则读它的真实仓库 URL
        if std::path::Path::new(&path).join(".svn").is_dir() {
            let info = svn::info(&path).await?;
            return Ok(Some(info.url));
        }
    }
    Ok(None)
}

/// 浏览远端仓库目录。
#[tauri::command]
pub async fn list_repo(url: String, auth_input: AuthInput) -> Result<Vec<RepoEntry>, SvnError> {
    let opts = resolve_auth(&url, &auth_input);
    let entries = svn::list_remote(&url, &opts).await?;
    maybe_remember(&url, &auth_input);
    Ok(entries)
}

/// 开始 checkout：立即返回任务 id，进度经 `svn-task-progress` 事件推送；
/// 完成/失败经 `svn-task-done` 事件通知。
#[tauri::command]
pub async fn start_checkout(
    app: tauri::AppHandle,
    url: String,
    dest: String,
    auth_input: AuthInput,
) -> Result<u64, SvnError> {
    use tauri::Emitter;

    svn::ensure_remote_url(&url)?;
    let task_id = svn::runner::next_task_id();

    tauri::async_runtime::spawn(async move {
        let opts = resolve_auth(&url, &auth_input);
        let result = svn::checkout(&url, &dest, &opts, task_id).await;
        if result.is_ok() {
            maybe_remember(&url, &auth_input);
        }
        // 完成事件：成功带修订号，失败带结构化错误
        #[derive(serde::Serialize, Clone)]
        #[serde(rename_all = "camelCase")]
        struct TaskDone {
            task_id: u64,
            revision: Option<i64>,
            error: Option<SvnError>,
            dest: String,
        }
        let payload = match result {
            Ok(rev) => TaskDone {
                task_id,
                revision: Some(rev),
                error: None,
                dest,
            },
            Err(e) => TaskDone {
                task_id,
                revision: None,
                error: Some(e),
                dest,
            },
        };
        let _ = app.emit("svn-task-done", &payload);
    });

    Ok(task_id)
}

/// 取消一个进行中的长任务（checkout）。
#[tauri::command]
pub fn cancel_task(task_id: u64) -> bool {
    svn::runner::cancel_task(task_id)
}

/// 查询某仓库 URL 是否已有保存的凭据（返回用户名，不返回密码）。
#[tauri::command]
pub fn get_saved_credential(url: String) -> Result<Option<String>, SvnError> {
    let realm = auth::realm_of(&url)?;
    Ok(auth::load(&realm)?.map(|c| c.username))
}

/// 删除某仓库 URL 保存的凭据。
#[tauri::command]
pub fn delete_saved_credential(url: String) -> Result<(), SvnError> {
    let realm = auth::realm_of(&url)?;
    auth::delete(&realm)
}
