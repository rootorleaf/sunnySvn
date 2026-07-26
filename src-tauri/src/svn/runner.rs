// svn 子进程执行器：统一注入 UTF-8 locale 与 --non-interactive，
// 捕获 stdout/stderr，非零退出码映射为结构化 SvnError；
// 每次执行都向前端「输出控制台」推送一条记录。

use std::process::Stdio;
use std::time::Instant;
use tokio::process::Command;

use super::errors::SvnError;
use super::locator::svn_path;
use crate::events::{emit_console, ConsoleLine};

/// 一次 svn 调用的结果
pub struct SvnOutput {
    pub stdout: String,
    // M2 认证/远端操作会读取 stderr 做 SSL 信任等分支处理
    #[allow(dead_code)]
    pub stderr: String,
}

/// 控制台输出的最大字符数，超出截断（避免 cat/diff 大文件刷屏）。
const CONSOLE_OUTPUT_LIMIT: usize = 8000;

/// 执行并推送控制台记录的统一入口。
///
/// - `dir`：工作目录（None 表示不指定，M2 checkout 等场景用）；
/// - `verbose`：true 时成功输出也推送到控制台（变更类命令）；
///   false 时成功只报命令与耗时（查询类命令，避免 XML 噪音），失败仍推送 stderr。
async fn exec(dir: Option<&str>, args: &[&str], verbose: bool) -> Result<SvnOutput, SvnError> {
    let bin = svn_path()?;

    // --non-interactive 必须前置：若追加在末尾，会落到 `--` 分隔符之后
    // 被 svn 当成路径（如 add/revert/delete -- <files> 的场景），导致 E200009。
    let mut cmd = Command::new(&bin);
    cmd.arg("--non-interactive")
        .args(args)
        .env("LC_ALL", "en_US.UTF-8")
        .env("LANG", "en_US.UTF-8")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(d) = dir {
        cmd.current_dir(d);
    }

    // 展示用命令行
    let display = match dir {
        Some(d) => format!("svn {} @ {}", args.join(" "), d),
        None => format!("svn {}", args.join(" ")),
    };

    let started = Instant::now();
    let output = cmd.output().await.map_err(|e| {
        let err = SvnError::internal(format!("无法执行 svn: {e}"));
        emit_console(ConsoleLine {
            command: display.clone(),
            output: err.message.clone(),
            success: false,
            duration_ms: started.elapsed().as_millis() as u64,
        });
        err
    })?;
    let duration_ms = started.elapsed().as_millis() as u64;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

    if output.status.success() {
        let console_out = if verbose {
            truncate_for_console(&format!("{stdout}{stderr}"))
        } else {
            String::new()
        };
        emit_console(ConsoleLine {
            command: display,
            output: console_out,
            success: true,
            duration_ms,
        });
        Ok(SvnOutput { stdout, stderr })
    } else {
        emit_console(ConsoleLine {
            command: display,
            output: truncate_for_console(&stderr),
            success: false,
            duration_ms,
        });
        Err(SvnError::from_stderr(&stderr))
    }
}

fn truncate_for_console(s: &str) -> String {
    let s = s.trim_end();
    if s.chars().count() <= CONSOLE_OUTPUT_LIMIT {
        return s.to_string();
    }
    let head: String = s.chars().take(CONSOLE_OUTPUT_LIMIT).collect();
    format!("{head}\n…（输出过长，已截断）")
}

/// 在工作副本目录下执行「变更类」命令（update/commit/add/…），成功输出会进控制台。
pub async fn run_in(dir: &str, args: &[&str]) -> Result<SvnOutput, SvnError> {
    exec(Some(dir), args, true).await
}

/// 在工作副本目录下执行「查询类」命令（status/info/log/cat），控制台只记命令与耗时。
pub async fn query_in(dir: &str, args: &[&str]) -> Result<SvnOutput, SvnError> {
    exec(Some(dir), args, false).await
}

/// 不指定工作目录执行。M2 的 checkout / 仓库浏览器等远端操作会用到。
#[allow(dead_code)]
pub async fn run(args: &[&str]) -> Result<SvnOutput, SvnError> {
    exec(None, args, true).await
}
