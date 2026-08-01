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
    parse_blame, parse_info, parse_list, parse_log, parse_proplist, parse_status, BlameLine,
    LogEntry, RepoEntry, StatusEntry, SvnProperty, WorkingCopyInfo,
};
pub use runner::AuthOptions;

/// 远端 URL 基本校验：仅允许 svn 支持的协议，防注入任意本地路径。
pub fn ensure_remote_url(url: &str) -> Result<(), SvnError> {
    const SCHEMES: &[&str] = &["http://", "https://", "svn://", "svn+ssh://", "file://"];
    if SCHEMES.iter().any(|s| url.starts_with(s)) && !url.contains(['\n', '\r']) {
        Ok(())
    } else {
        Err(SvnError::new("BAD_URL", format!("不是有效的仓库 URL: {url}")))
    }
}

/// 浏览远端仓库目录：`svn list --xml <url>`。
pub async fn list_remote(url: &str, auth: &AuthOptions) -> Result<Vec<RepoEntry>, SvnError> {
    ensure_remote_url(url)?;
    let out = runner::query_remote(&["list", "--xml", "--", url], auth).await?;
    parse_list(&out.stdout)
}

/// checkout：流式推送进度（task_id 对应 svn-task-progress 事件），可取消。
/// 返回 checkout 到的修订号。
pub async fn checkout(
    url: &str,
    dest: &str,
    auth: &AuthOptions,
    task_id: u64,
) -> Result<i64, SvnError> {
    ensure_remote_url(url)?;
    if !dest.starts_with('/') {
        return Err(SvnError::new("BAD_PATH", "目标目录必须是绝对路径"));
    }
    let out = runner::run_streaming(None, &["checkout", "--", url, dest], auth, task_id).await?;
    Ok(extract_checked_out_revision(&out.stdout).unwrap_or(0))
}

/// 从 checkout 输出中抓取 `Checked out revision N.`。
fn extract_checked_out_revision(stdout: &str) -> Option<i64> {
    for line in stdout.lines().rev() {
        let line = line.trim().trim_end_matches('.');
        if let Some(rest) = line.strip_prefix("Checked out revision ") {
            if let Ok(n) = rest.trim().parse::<i64>() {
                return Some(n);
            }
        }
    }
    None
}

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

/// 轻量获取改动文件数：`svn status -q`（只输出有改动的项，纯文本）。
/// 供侧栏角标用，比解析完整 XML 快。
pub async fn status_count(path: &str) -> Result<usize, SvnError> {
    let out = runner::query_in(path, &["status", "--quiet"]).await?;
    // 每个有改动的文件/目录一行；空行不计
    Ok(out.stdout.lines().filter(|l| !l.trim().is_empty()).count())
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
/// - 目录没有文本内容，返回 IS_DIRECTORY 让前端给出明确提示；
/// - 新增/未版本化文件：BASE 为空；
/// - 已删除/丢失文件：工作区为空；
/// - 含 NUL 或非 UTF-8 的内容视为二进制，返回 BINARY_FILE。
pub async fn file_diff(path: &str, file: &str) -> Result<FileDiff, SvnError> {
    ensure_rel_paths(&[file.to_string()])?;

    let full_path = Path::new(path).join(file);
    if full_path.is_dir() {
        return Err(SvnError::new(
            "IS_DIRECTORY",
            format!("{file} 是目录，没有可对比的文本内容"),
        ));
    }

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

// ========== M3: 分支 / 合并 / 冲突 / blame / 属性 / 其它 ==========

/// 远端 copy：创建分支或标签。`src`/`dst` 均为仓库 URL。
pub async fn remote_copy(
    src: &str,
    dst: &str,
    message: &str,
    auth: &AuthOptions,
) -> Result<i64, SvnError> {
    ensure_remote_url(src)?;
    ensure_remote_url(dst)?;
    if message.trim().is_empty() {
        return Err(SvnError::new("EMPTY_MESSAGE", "提交信息不能为空"));
    }
    let out = runner::run_remote(
        &["copy", "-m", message, "--", src, dst],
        auth,
    )
    .await?;
    Ok(extract_committed_revision(&out.stdout).unwrap_or(0))
}

/// 切换工作副本到另一 URL（分支/标签）。
pub async fn switch(
    path: &str,
    url: &str,
    auth: &AuthOptions,
) -> Result<i64, SvnError> {
    ensure_remote_url(url)?;
    let out = runner::run_in_auth(
        path,
        &["switch", "--accept", "postpone", "--", url],
        auth,
    )
    .await?;
    Ok(extract_revision(&out.stdout).unwrap_or(0))
}

/// 合并结果：原始输出文本（含 U/G/C 状态行）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    pub output: String,
    /// 是否出现冲突标记（C 开头状态行）
    pub has_conflicts: bool,
}

/// 将 source_url 合并进工作副本。`revision_range` 可选，如 `100:200` 或 `100`。
pub async fn merge(
    path: &str,
    source_url: &str,
    revision_range: Option<&str>,
    auth: &AuthOptions,
) -> Result<MergeResult, SvnError> {
    ensure_remote_url(source_url)?;
    // owned Vec 再借成 &[&str]，支持可选 -r 与生命周期
    let owned: Vec<String> = {
        let mut v = vec!["merge".into(), "--accept".into(), "postpone".into()];
        if let Some(r) = revision_range {
            if !r.is_empty() {
                v.push("-r".into());
                v.push(r.into());
            }
        }
        v.push("--".into());
        v.push(source_url.into());
        v.push(".".into());
        v
    };
    let arg_refs: Vec<&str> = owned.iter().map(|s| s.as_str()).collect();
    let out = runner::run_in_auth(path, &arg_refs, auth).await?;
    let has_conflicts = out.stdout.lines().any(|l| {
        let t = l.trim_start();
        t.starts_with('C') || t.starts_with("Conflict")
    });
    Ok(MergeResult {
        output: out.stdout,
        has_conflicts,
    })
}

/// 标记冲突已解决。`accept` 为 mine-full / theirs-full / working / base。
pub async fn resolve(
    path: &str,
    files: &[String],
    accept: &str,
) -> Result<(), SvnError> {
    ensure_rel_paths(files)?;
    if files.is_empty() {
        return Err(SvnError::new("EMPTY", "未选择冲突文件"));
    }
    let allowed = ["mine-full", "theirs-full", "working", "base", "mine-conflict", "theirs-conflict"];
    if !allowed.contains(&accept) {
        return Err(SvnError::new("BAD_ACCEPT", format!("不支持的 resolve 策略: {accept}")));
    }
    let mut args = vec!["resolve", "--accept", accept, "--"];
    args.extend(as_strs(files));
    runner::run_in(path, &args).await?;
    Ok(())
}

/// 读取 blame：先 parse_blame，再用 cat 补齐每行正文。
pub async fn blame(path: &str, file: &str) -> Result<Vec<BlameLine>, SvnError> {
    ensure_rel_paths(&[file.to_string()])?;
    let full = Path::new(path).join(file);
    if full.is_dir() {
        return Err(SvnError::new("IS_DIRECTORY", format!("{file} 是目录，无法 blame")));
    }

    let out = runner::query_in(path, &["blame", "--xml", "--", file]).await?;
    let mut lines = parse_blame(&out.stdout)?;

    // 补齐正文：优先工作区文件，失败则 cat
    let content = match std::fs::read_to_string(&full) {
        Ok(s) => s,
        Err(_) => match runner::query_in(path, &["cat", "--", file]).await {
            Ok(o) => o.stdout,
            Err(_) => String::new(),
        },
    };
    // 保留末尾空行：lines() 会丢弃，用 split 更稳
    let body: Vec<&str> = if content.is_empty() {
        Vec::new()
    } else {
        content.split('\n').collect()
    };
    // 若文件以 \n 结尾，split 会多一个空串
    let body_lines: Vec<&str> = if body.last() == Some(&"") {
        body[..body.len().saturating_sub(1)].to_vec()
    } else {
        body
    };

    for (i, bl) in lines.iter_mut().enumerate() {
        if let Some(text) = body_lines.get(i) {
            bl.content = (*text).to_string();
        }
    }
    // blame 行数少于正文时补齐（本地新增行可能不在 blame 里，视 svn 版本）
    if body_lines.len() > lines.len() {
        for (i, text) in body_lines.iter().enumerate().skip(lines.len()) {
            lines.push(BlameLine {
                line_number: (i as i64) + 1,
                content: (*text).to_string(),
                revision: None,
                author: String::new(),
                date: String::new(),
            });
        }
    }
    Ok(lines)
}

/// 列出路径上的属性（-v 含值）。
pub async fn proplist(path: &str, target: &str) -> Result<Vec<SvnProperty>, SvnError> {
    // target 可以是 "." 表示工作副本根
    if target != "." {
        ensure_rel_paths(&[target.to_string()])?;
    }
    let out = runner::query_in(path, &["proplist", "-v", "--xml", "--", target]).await?;
    parse_proplist(&out.stdout)
}

/// 设置属性。value 为空时删除属性。
pub async fn propset(path: &str, target: &str, name: &str, value: &str) -> Result<(), SvnError> {
    if target != "." {
        ensure_rel_paths(&[target.to_string()])?;
    }
    if name.is_empty() || name.contains(['\n', '\r', '=']) {
        return Err(SvnError::new("BAD_PROP", format!("非法属性名: {name}")));
    }
    if value.is_empty() {
        runner::run_in(path, &["propdel", name, "--", target]).await?;
    } else {
        // 用临时文件传多行值，避免 shell/参数转义问题
        let tmp = write_prop_file(value)?;
        let tmp_s = tmp.to_string_lossy().into_owned();
        let res = runner::run_in(
            path,
            &["propset", name, "-F", &tmp_s, "--", target],
        )
        .await;
        let _ = std::fs::remove_file(&tmp);
        res?;
    }
    Ok(())
}

/// 右键「加入忽略」：在父目录的 svn:ignore 中追加 basename。
pub async fn add_to_ignore(path: &str, rel_file: &str) -> Result<(), SvnError> {
    ensure_rel_paths(&[rel_file.to_string()])?;
    let p = Path::new(rel_file);
    let parent = p
        .parent()
        .map(|x| x.to_string_lossy().into_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| ".".into());
    let base = p
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or_else(|| SvnError::new("BAD_PATH", format!("无法取文件名: {rel_file}")))?;

    let props = proplist(path, &parent).await.unwrap_or_default();
    let mut ignore = props
        .iter()
        .find(|p| p.name == "svn:ignore")
        .map(|p| p.value.clone())
        .unwrap_or_default();

    // 已存在则跳过
    let lines: Vec<&str> = ignore.lines().collect();
    if lines.iter().any(|l| *l == base) {
        return Ok(());
    }
    if !ignore.is_empty() && !ignore.ends_with('\n') {
        ignore.push('\n');
    }
    ignore.push_str(&base);
    ignore.push('\n');
    propset(path, &parent, "svn:ignore", &ignore).await
}

/// Cleanup 工作副本。
pub async fn cleanup(path: &str) -> Result<(), SvnError> {
    runner::run_in(path, &["cleanup"]).await?;
    Ok(())
}

/// 锁定文件。
pub async fn lock(path: &str, files: &[String], message: Option<&str>) -> Result<(), SvnError> {
    ensure_rel_paths(files)?;
    let mut owned = vec!["lock".to_string()];
    if let Some(m) = message {
        if !m.is_empty() {
            owned.push("-m".into());
            owned.push(m.into());
        }
    }
    owned.push("--".into());
    owned.extend(files.iter().cloned());
    let refs: Vec<&str> = owned.iter().map(|s| s.as_str()).collect();
    runner::run_in(path, &refs).await?;
    Ok(())
}

/// 解锁文件。
pub async fn unlock(path: &str, files: &[String]) -> Result<(), SvnError> {
    ensure_rel_paths(files)?;
    let mut args = vec!["unlock", "--"];
    args.extend(as_strs(files));
    runner::run_in(path, &args).await?;
    Ok(())
}

/// 重定位工作副本到新仓库 URL。
pub async fn relocate(
    path: &str,
    from_url: &str,
    to_url: &str,
    auth: &AuthOptions,
) -> Result<(), SvnError> {
    ensure_remote_url(from_url)?;
    ensure_remote_url(to_url)?;
    runner::run_in_auth(
        path,
        &["relocate", "--", from_url, to_url],
        auth,
    )
    .await?;
    Ok(())
}

/// 任意两个修订之间的 diff 文本（unified）。
pub async fn rev_diff(
    path: &str,
    file: Option<&str>,
    rev1: i64,
    rev2: i64,
) -> Result<String, SvnError> {
    let r1 = rev1.to_string();
    let r2 = rev2.to_string();
    let mut owned = vec![
        "diff".into(),
        "-r".into(),
        format!("{r1}:{r2}"),
    ];
    if let Some(f) = file {
        ensure_rel_paths(&[f.to_string()])?;
        owned.push("--".into());
        owned.push(f.into());
    }
    let refs: Vec<&str> = owned.iter().map(|s| s.as_str()).collect();
    let out = runner::query_in(path, &refs).await?;
    Ok(out.stdout)
}

fn write_prop_file(value: &str) -> Result<PathBuf, SvnError> {
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let n = SEQ.fetch_add(1, Ordering::Relaxed);
    let mut p = std::env::temp_dir();
    p.push(format!("sunnysvn-prop-{}-{n}.txt", std::process::id()));
    std::fs::write(&p, value)
        .map_err(|e| SvnError::internal(format!("写入属性临时文件失败: {e}")))?;
    Ok(p)
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
    fn extracts_checked_out_revision() {
        assert_eq!(
            extract_checked_out_revision("A    /tmp/x/a.txt\nChecked out revision 2."),
            Some(2)
        );
        assert_eq!(extract_checked_out_revision("nothing"), None);
    }

    #[test]
    fn validates_remote_urls() {
        assert!(ensure_remote_url("https://svn.example.com/repo").is_ok());
        assert!(ensure_remote_url("svn://host/repo").is_ok());
        assert!(ensure_remote_url("file:///tmp/repo").is_ok());
        assert!(ensure_remote_url("/local/path").is_err());
        assert!(ensure_remote_url("ftp://host/x").is_err());
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
