// 工作副本列表的持久化命令。存储于
// ~/Library/Application Support/com.rootorleaf.sunnysvn/config.json。
// 添加时校验路径确为有效 svn 工作副本，并用路径哈希生成稳定 id。

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::svn::{self, SvnError};

/// 前端持久化的工作副本条目，字段对齐 types.ts 的 WorkingCopy。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkingCopy {
    pub id: String,
    pub name: String,
    pub path: String,
}

/// 磁盘上的配置结构，预留扩展位。
#[derive(Debug, Default, Serialize, Deserialize)]
struct AppConfig {
    #[serde(default)]
    working_copies: Vec<WorkingCopy>,
    /// 最近使用的提交信息（新的在前，去重，最多 20 条）
    #[serde(default)]
    recent_messages: Vec<String>,
}

/// 进程内配置缓存，避免每次命令都读盘；写操作同步落盘。
static CONFIG: Mutex<Option<AppConfig>> = Mutex::new(None);

/// 配置文件路径：~/Library/Application Support/<identifier>/config.json
fn config_path() -> Result<PathBuf, SvnError> {
    let base = dirs_config_dir()
        .ok_or_else(|| SvnError::internal("无法定位应用配置目录"))?
        .join("com.rootorleaf.sunnysvn");
    if !base.exists() {
        fs::create_dir_all(&base)
            .map_err(|e| SvnError::internal(format!("创建配置目录失败: {e}")))?;
    }
    Ok(base.join("config.json"))
}

/// macOS 的 Application Support 目录。避免额外依赖，直接从 HOME 拼装。
fn dirs_config_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(|h| PathBuf::from(h).join("Library").join("Application Support"))
}

/// 从磁盘读取配置（不存在则返回空配置）。
fn load_from_disk() -> AppConfig {
    let path = match config_path() {
        Ok(p) => p,
        Err(_) => return AppConfig::default(),
    };
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

/// 将配置写回磁盘。
fn save_to_disk(cfg: &AppConfig) -> Result<(), SvnError> {
    let path = config_path()?;
    let json = serde_json::to_string_pretty(cfg)
        .map_err(|e| SvnError::internal(format!("序列化配置失败: {e}")))?;
    fs::write(&path, json).map_err(|e| SvnError::internal(format!("写入配置失败: {e}")))
}

/// 取出缓存中的配置副本（首次调用时从磁盘加载）。
fn with_config<T>(f: impl FnOnce(&mut AppConfig) -> T) -> Result<T, SvnError> {
    let mut guard = CONFIG
        .lock()
        .map_err(|_| SvnError::internal("配置锁中毒"))?;
    if guard.is_none() {
        *guard = Some(load_from_disk());
    }
    Ok(f(guard.as_mut().unwrap()))
}

/// 用绝对路径的 sha256 前 12 位作为稳定 id。
fn path_id(path: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    let digest = hasher.finalize();
    hex12(&digest)
}

fn hex12(bytes: &[u8]) -> String {
    bytes
        .iter()
        .take(6)
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// 从路径取末段目录名作为显示名。
fn dir_name(path: &str) -> String {
    PathBuf::from(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

/// 读取已保存的工作副本列表。
#[tauri::command]
pub fn list_working_copies() -> Result<Vec<WorkingCopy>, SvnError> {
    with_config(|cfg| cfg.working_copies.clone())
}

/// 添加工作副本：校验为有效 svn 工作副本后写入，返回完整列表。
#[tauri::command]
pub async fn add_working_copy(path: String) -> Result<Vec<WorkingCopy>, SvnError> {
    // 规范化：去掉末尾斜杠
    let path = path.trim_end_matches('/').to_string();

    if !svn::is_working_copy(&path).await {
        return Err(SvnError::new(
            "NOT_WORKING_COPY",
            format!("{path} 不是有效的 svn 工作副本"),
        ));
    }

    let id = path_id(&path);
    with_config(|cfg| {
        if !cfg.working_copies.iter().any(|w| w.id == id) {
            cfg.working_copies.push(WorkingCopy {
                id: id.clone(),
                name: dir_name(&path),
                path: path.clone(),
            });
        }
    })?;

    with_config(|cfg| save_to_disk(cfg))??;
    with_config(|cfg| cfg.working_copies.clone())
}

/// 按 id 移除工作副本，返回完整列表。
#[tauri::command]
pub fn remove_working_copy(id: String) -> Result<Vec<WorkingCopy>, SvnError> {
    with_config(|cfg| {
        cfg.working_copies.retain(|w| w.id != id);
    })?;
    with_config(|cfg| save_to_disk(cfg))??;
    with_config(|cfg| cfg.working_copies.clone())
}

/// 最大保留的提交信息条数。
const MAX_RECENT_MESSAGES: usize = 20;

/// 记录一条提交信息到历史（提交成功后由 svn_cmd 调用）。
/// 去重后插到最前，超出上限截断；持久化失败静默忽略（不影响提交结果）。
pub fn remember_message(message: &str) {
    let msg = message.trim();
    if msg.is_empty() {
        return;
    }
    let _ = with_config(|cfg| {
        cfg.recent_messages.retain(|m| m != msg);
        cfg.recent_messages.insert(0, msg.to_string());
        cfg.recent_messages.truncate(MAX_RECENT_MESSAGES);
        save_to_disk(cfg)
    });
}

/// 读取提交信息历史（新的在前）。
#[tauri::command]
pub fn list_recent_messages() -> Result<Vec<String>, SvnError> {
    with_config(|cfg| cfg.recent_messages.clone())
}
