// svn 引擎：定位二进制、执行子进程、解析 --xml 输出、映射错误码。
// 上层 commands 只依赖这里导出的函数与类型。

pub mod errors;
pub mod locator;
pub mod parser;
pub mod runner;

pub use errors::SvnError;
pub use locator::{detect, SvnInfo};
pub use parser::{parse_info, parse_status, StatusEntry, WorkingCopyInfo};

/// 读取工作副本状态：`svn status --xml`（不带 -u，仅本地状态，快）。
pub async fn status(path: &str) -> Result<Vec<StatusEntry>, SvnError> {
    let out = runner::run_in(path, &["status", "--xml"]).await?;
    parse_status(&out.stdout)
}

/// 读取工作副本信息：`svn info --xml`。
pub async fn info(path: &str) -> Result<WorkingCopyInfo, SvnError> {
    let out = runner::run_in(path, &["info", "--xml"]).await?;
    parse_info(&out.stdout)
}

/// 判断路径是否为有效工作副本：info 成功即认为是。
pub async fn is_working_copy(path: &str) -> bool {
    runner::run_in(path, &["info", "--xml"]).await.is_ok()
}

/// 执行 update，返回更新后的修订号。
/// `svn update` 输出末行形如 `At revision 42.` 或 `Updated to revision 42.`
pub async fn update(path: &str) -> Result<i64, SvnError> {
    let out = runner::run_in(path, &["update", "--accept", "postpone"]).await?;
    Ok(extract_revision(&out.stdout).unwrap_or(0))
}

/// 从 update 输出中抓取尾部的修订号。
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
}
