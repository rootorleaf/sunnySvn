// 定位 svn 二进制并读取版本。
// 顺序：PATH → /opt/homebrew/bin → /usr/local/bin。找不到则返回 SVN_NOT_FOUND。

use super::errors::SvnError;
use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

/// 缓存定位到的 svn 路径，避免每次命令都重新探测。
static SVN_PATH: OnceLock<Option<PathBuf>> = OnceLock::new();

/// 候选安装位置（Apple Silicon 上 Homebrew 默认在 /opt/homebrew）
const CANDIDATES: &[&str] = &["/opt/homebrew/bin/svn", "/usr/local/bin/svn"];

/// 返回 svn 二进制路径；找不到时返回 None。结果被缓存。
pub fn find_svn() -> Option<PathBuf> {
    SVN_PATH
        .get_or_init(|| {
            // 1. 先看 PATH 里能否直接跑通
            if let Ok(out) = Command::new("svn").arg("--version").arg("--quiet").output() {
                if out.status.success() {
                    return Some(PathBuf::from("svn"));
                }
            }
            // 2. 逐个探测已知安装位置
            for cand in CANDIDATES {
                let p = PathBuf::from(cand);
                if p.exists() {
                    return Some(p);
                }
            }
            None
        })
        .clone()
}

/// 返回 svn 二进制路径，供执行器使用；找不到时返回结构化错误。
pub fn svn_path() -> Result<PathBuf, SvnError> {
    find_svn().ok_or_else(|| {
        SvnError::not_found("未找到 svn。请通过 Homebrew 安装：brew install subversion")
    })
}

/// svn 探测结果，序列化给前端。
#[derive(Debug, Clone, serde::Serialize)]
pub struct SvnInfo {
    pub path: String,
    pub version: String,
}

/// 探测 svn 并读取版本号。找不到或无法执行时返回结构化错误。
pub fn detect() -> Result<SvnInfo, SvnError> {
    let path = find_svn().ok_or_else(|| {
        SvnError::not_found(
            "未找到 svn。请通过 Homebrew 安装：brew install subversion",
        )
    })?;

    let out = Command::new(&path)
        .arg("--version")
        .arg("--quiet")
        .output()
        .map_err(|e| SvnError::not_found(format!("无法执行 svn：{e}")))?;

    if !out.status.success() {
        return Err(SvnError::from_stderr(&String::from_utf8_lossy(&out.stderr)));
    }

    let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
    Ok(SvnInfo {
        path: path.to_string_lossy().to_string(),
        version,
    })
}
