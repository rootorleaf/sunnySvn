// svn 引擎：定位二进制、执行子进程、解析 --xml 输出、映射错误码。
// 上层 commands 只依赖这里导出的函数与类型。

pub mod errors;
pub mod locator;
pub mod parser;
pub mod runner;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub use errors::SvnError;
pub use locator::{detect, SvnInfo};
pub use parser::{
    parse_info, parse_log, parse_status, LogEntry, StatusEntry, WorkingCopyInfo,
};

/// 相对路径安全校验：拒绝绝对路径与包含 `..` 的路径，
/// 防止 IPC 传入越出工作副本的目标。
fn ensure_rel_paths(files: &[String]) -> Result<(), SvnError> {
    for f in files {
        if f.is_empty() || f.starts_with('/') || f.split('/').any(|seg| seg == "..") {
            return Err(SvnError::new("BAD_PATH", format!("非法路径: {f}")));
        }
    }
    Ok(())
}

/// 把 String 列表借成 &str 列表，便于拼接 args。
fn as_strs(v: &[String]) -> Vec<&str> {
    v.iter().map(|s| s.as_str()).collect()
}

/// 读取工作副本状态：`svn status --xml`（不带 -u，仅本地状态，快）。
pub async fn status(path: &str) -> Result<Vec<StatusEntry>, SvnError> {
    let out = runner::query_in(path, &["status", "--xml"]).await?;
    parse_status(&out.stdout)
}

/// 读取工作副本信息：`svn info --xml`。
pub async fn info(path: &str) -> Result<WorkingCopyInfo, SvnError> {
    let out = runner::query_in(path, &["info", "--xml"]).await?;
    parse_info(&out.stdout)
}

/// 判断路径是否为有效工作副本：info 成功即认为是。
pub async fn is_working_copy(path: &str) -> bool {
    runner::query_in(path, &["info", "--xml"]).await.is_ok()
}

/// 执行 update，返回更新后的修订号。
pub async fn update(path: &str) -> Result<i64, SvnError> {
    let out = runner::run_in(path, &["update", "--accept", "postpone"]).await?;
    Ok(extract_revision(&out.stdout).unwrap_or(0))
}

/// 提交：用 --targets 临时文件传路径，规避参数长度限制与转义问题。
/// 返回新修订号。
pub async fn commit(path: &str, files: &[String], message: &str) -> Result<i64, SvnError> {
    ensure_rel_paths(files)?;
    if files.is_empty() {
        return Err(SvnError::new("EMPTY_COMMIT", "未选择要提交的文件"));
    }
    let targets = write_targets_file(files)?;
    let targets_str = targets.to_string_lossy().into_owned();
    let res = runner::run_in(
        path,
        &["commit", "-m", message, "--targets", &targets_str],
    )
    .await;
    let _ = std::fs::remove_file(&targets); // 无论成败都清理临时文件
    let out = res?;
    Ok(extract_committed_revision(&out.stdout).unwrap_or(0))
}

/// 把未版本化文件加入版本控制。--parents 自动补齐中间目录。
pub async fn add(path: &str, files: &[String]) -> Result<(), SvnError> {
    ensure_rel_paths(files)?;
    let mut args = vec!["add", "--parents", "--"];
    args.extend(as_strs(files));
    runner::run_in(path, &args).await?;
    Ok(())
}

/// 删除：受版本控制的走 `svn delete --force`；未版本化的直接删文件系统。
pub async fn delete(
    path: &str,
    versioned: &[String],
    unversioned: &[String],
) -> Result<(), SvnError> {
    ensure_rel_paths(versioned)?;
    ensure_rel_paths(unversioned)?;

    if !versioned.is_empty() {
        let mut args = vec!["delete", "--force", "--"];
        args.extend(as_strs(versioned));
        runner::run_in(path, &args).await?;
    }
    for rel in unversioned {
        let full = Path::new(path).join(rel);
        let meta = std::fs::symlink_metadata(&full)
            .map_err(|e| SvnError::internal(format!("读取 {rel} 失败: {e}")))?;
        let result = if meta.is_dir() {
            std::fs::remove_dir_all(&full)
        } else {
            std::fs::remove_file(&full)
        };
        result.map_err(|e| SvnError::internal(format!("删除 {rel} 失败: {e}")))?;
    }
    Ok(())
}

/// 还原本地改动（非递归，按选中项逐个还原）。
pub async fn revert(path: &str, files: &[String]) -> Result<(), SvnError> {
    ensure_rel_paths(files)?;
    let mut args = vec!["revert", "--"];
    args.extend(as_strs(files));
    runner::run_in(path, &args).await?;
    Ok(())
}

/// 文件差异内容：BASE 版本 + 工作区当前内容，前端用双栏对比渲染。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub old_text: String,
    pub new_text: String,
}

/// 读取单个文件的 BASE / 工作区内容。
/// - 新增/未版本化文件：BASE 为空；
/// - 已删除/丢失文件：工作区为空；
/// - 含 NUL 或非 UTF-8 的内容视为二进制，返回 BINARY_FILE。
pub async fn file_diff(path: &str, file: &str) -> Result<FileDiff, SvnError> {
    ensure_rel_paths(&[file.to_string()])?;

    // BASE 内容：不在版本控制或无 BASE 时视为空（cat 失败不算错误）
    let old_text = match runner::query_in(path, &["cat", "-r", "BASE", "--", file]).await {
        Ok(out) => ensure_text(out.stdout.into_bytes(), file)?,
        Err(_) => String::new(),
    };

    // 工作区内容：文件不存在（已删除/丢失）视为空
    let full = Path::new(path).join(file);
    let new_text = match std::fs::read(&full) {
        Ok(bytes) => ensure_text(bytes, file)?,
        Err(_) => String::new(),
    };

    Ok(FileDiff { old_text, new_text })
}

/// 二进制探测：含 NUL 字节或非 UTF-8 即拒绝对比。
fn ensure_text(bytes: Vec<u8>, file: &str) -> Result<String, SvnError> {
    if bytes.contains(&0) {
        return Err(SvnError::new(
            "BINARY_FILE",
            format!("{file} 是二进制文件，暂不支持文本对比"),
        ));
    }
    String::from_utf8(bytes).map_err(|_| {
        SvnError::new(
            "BINARY_FILE",
            format!("{file} 不是 UTF-8 文本，暂不支持文本对比"),
        )
    })
}

/// 读取提交日志（-v 含变更路径）。
/// `before_rev` 为 None 时从 HEAD 往回取；分页时传上一页最后一条的 revision - 1。
pub async fn log(path: &str, limit: u32, before_rev: Option<i64>) -> Result<Vec<LogEntry>, SvnError> {
    let range = match before_rev {
        Some(r) => format!("{r}:1"),
        None => "HEAD:1".to_string(),
    };
    let limit_s = limit.to_string();
    let out = runner::query_in(
        path,
        &["log", "--xml", "-v", "-l", &limit_s, "-r", &range],
    )
    .await?;
    parse_log(&out.stdout)
}

/// targets 临时文件：每行一个路径，UTF-8。用计数器 + pid 保证并发唯一。
fn write_targets_file(files: &[String]) -> Result<PathBuf, SvnError> {
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let n = SEQ.fetch_add(1, Ordering::Relaxed);
    let mut p = std::env::temp_dir();
    p.push(format!(
        "sunnysvn-targets-{}-{n}.txt",
        std::process::id()
    ));
    std::fs::write(&p, files.join("\n"))
        .map_err(|e| SvnError::internal(format!("写入提交清单失败: {e}")))?;
    Ok(p)
}

/// 从 update 输出中抓取尾部的修订号。
/// `svn update` 输出末行形如 `At revision 42.` 或 `Updated to revision 42.`
fn extract_revision(stdout: &str) -> Option<i64> {
    for line in stdout.lines().rev() {
        let line = line.trim().trim_end_matches('.');
        if let Some(rest) = line
            .strip_prefix("At revision ")
            .or_else(|| line.strip_prefix("Updated to revision "))
        {
            if let Ok(n) = rest.trim().parse::<i64>() {
                return Some(n);
            }
        }
    }
    None
}

/// 从 commit 输出中抓取 `Committed revision N.`。
fn extract_committed_revision(stdout: &str) -> Option<i64> {
    for line in stdout.lines().rev() {
        let line = line.trim().trim_end_matches('.');
        if let Some(rest) = line.strip_prefix("Committed revision ") {
            if let Ok(n) = rest.trim().parse::<i64>() {
                return Some(n);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_revision_from_update_output() {
        assert_eq!(extract_revision("At revision 42."), Some(42));
        assert_eq!(
            extract_revision("Updating '.':\nUpdated to revision 108."),
            Some(108)
        );
        assert_eq!(extract_revision("no revision here"), None);
    }

    #[test]
    fn extracts_committed_revision() {
        let out = "Sending        main.rs\nTransmitting file data .done\nCommitting transaction...\nCommitted revision 7.";
        assert_eq!(extract_committed_revision(out), Some(7));
        assert_eq!(extract_committed_revision("nothing"), None);
    }

    #[test]
    fn rejects_bad_paths() {
        assert!(ensure_rel_paths(&["/etc/passwd".into()]).is_err());
        assert!(ensure_rel_paths(&["a/../../b".into()]).is_err());
        assert!(ensure_rel_paths(&["".into()]).is_err());
        assert!(ensure_rel_paths(&["src/main.rs".into(), "说明.md".into()]).is_ok());
    }

    #[test]
    fn binary_detection() {
        assert!(ensure_text(vec![0x68, 0x00, 0x69], "f").is_err()); // NUL
        assert!(ensure_text(vec![0xff, 0xfe], "f").is_err()); // 非 UTF-8
        assert_eq!(ensure_text("中文ok".as_bytes().to_vec(), "f").unwrap(), "中文ok");
    }
}
