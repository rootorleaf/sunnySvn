// svn 子进程执行器：统一注入 UTF-8 locale 与 --non-interactive，
// 捕获 stdout/stderr，非零退出码映射为结构化 SvnError；
// 每次执行都向前端「输出控制台」推送一条记录。
//
// 认证：密码通过 --password-from-stdin 从标准输入传给 svn，
// 不进进程参数（ps 不可见）、不落盘；用户名走参数（非敏感）。

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

use super::errors::SvnError;
use super::locator::svn_path;
use crate::events::{emit_console, emit_task_line, ConsoleLine};

/// 一次 svn 调用的结果
pub struct SvnOutput {
    pub stdout: String,
    #[allow(dead_code)]
    pub stderr: String,
}

/// 认证与信任选项，随命令一起传入执行器。
#[derive(Debug, Clone, Default)]
pub struct AuthOptions {
    pub username: Option<String>,
    pub password: Option<String>,
    /// SSL 证书不受信时（E230001），确认后重试附加 --trust-server-cert-failures
    pub trust_cert: bool,
}

/// 控制台输出的最大字符数，超出截断（避免 cat/diff 大文件刷屏）。
const CONSOLE_OUTPUT_LIMIT: usize = 8000;

/// 运行中的长任务表：task id → 子进程 PID（用于取消时 kill）。
static RUNNING_TASKS: Mutex<Option<HashMap<u64, u32>>> = Mutex::new(None);
static TASK_SEQ: AtomicU64 = AtomicU64::new(1);

fn track_task(id: u64, pid: Option<u32>) {
    if let (Some(pid), Ok(mut guard)) = (pid, RUNNING_TASKS.lock()) {
        guard.get_or_insert_with(HashMap::new).insert(id, pid);
    }
}

fn untrack_task(id: u64) {
    if let Ok(mut guard) = RUNNING_TASKS.lock() {
        if let Some(map) = guard.as_mut() {
            map.remove(&id);
        }
    }
}

/// 取消一个长任务：向其进程组发 SIGTERM。任务不存在返回 false。
pub fn cancel_task(id: u64) -> bool {
    let pid = RUNNING_TASKS
        .lock()
        .ok()
        .and_then(|g| g.as_ref().and_then(|m| m.get(&id).copied()));
    match pid {
        Some(pid) => {
            // SIGTERM 让 svn 有机会清理工作队列
            unsafe { libc_kill(pid as i32, 15) == 0 }
        }
        None => false,
    }
}

// 直接声明 kill，避免为一个调用引入 libc 依赖
extern "C" {
    #[link_name = "kill"]
    fn libc_kill(pid: i32, sig: i32) -> i32;
}

/// 构建命令：全局选项前置（--non-interactive / 认证 / 信任），再接子命令参数。
fn build_command(
    bin: &std::path::Path,
    args: &[&str],
    auth: &AuthOptions,
    dir: Option<&str>,
) -> Command {
    let mut cmd = Command::new(bin);
    cmd.arg("--non-interactive");
    if let Some(u) = &auth.username {
        cmd.arg("--username").arg(u);
    }
    if auth.password.is_some() {
        cmd.arg("--password-from-stdin");
    }
    if auth.trust_cert {
        cmd.arg("--trust-server-cert-failures")
            .arg("unknown-ca,cn-mismatch,expired,not-yet-valid,other");
    }
    cmd.args(args)
        .env("LC_ALL", "en_US.UTF-8")
        .env("LANG", "en_US.UTF-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd.stdin(if auth.password.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    });
    if let Some(d) = dir {
        cmd.current_dir(d);
    }
    cmd
}

/// 把密码写进子进程 stdin 后关闭（svn 读到 EOF 为止）。
async fn feed_password(child: &mut tokio::process::Child, auth: &AuthOptions) {
    if let (Some(pass), Some(mut stdin)) = (&auth.password, child.stdin.take()) {
        let _ = stdin.write_all(pass.as_bytes()).await;
        // drop 关闭管道
    }
}

/// 执行并推送控制台记录的统一入口。
async fn exec_with(
    dir: Option<&str>,
    args: &[&str],
    auth: &AuthOptions,
    verbose: bool,
) -> Result<SvnOutput, SvnError> {
    let bin = svn_path()?;
    let mut cmd = build_command(&bin, args, auth, dir);

    // 展示用命令行（不含认证信息）
    let display = match dir {
        Some(d) => format!("svn {} @ {}", args.join(" "), d),
        None => format!("svn {}", args.join(" ")),
    };

    let started = Instant::now();
    let mut child = cmd.spawn().map_err(|e| {
        let err = SvnError::internal(format!("无法执行 svn: {e}"));
        emit_console(ConsoleLine {
            command: display.clone(),
            output: err.message.clone(),
            success: false,
            duration_ms: 0,
        });
        err
    })?;
    feed_password(&mut child, auth).await;

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| SvnError::internal(format!("等待 svn 退出失败: {e}")))?;
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

/// 长任务执行：stdout 按行流式推送 `svn-task-progress` 事件，可取消。
/// 返回 (task_id, JoinHandle 内部等待结果)。上层先拿 task_id 回给前端，再 await 结果。
pub async fn run_streaming(
    dir: Option<&str>,
    args: &[&str],
    auth: &AuthOptions,
    task_id: u64,
) -> Result<SvnOutput, SvnError> {
    let bin = svn_path()?;
    let mut cmd = build_command(&bin, args, auth, dir);

    let display = match dir {
        Some(d) => format!("svn {} @ {}", args.join(" "), d),
        None => format!("svn {}", args.join(" ")),
    };

    let started = Instant::now();
    let mut child = cmd
        .spawn()
        .map_err(|e| SvnError::internal(format!("无法执行 svn: {e}")))?;
    track_task(task_id, child.id());
    feed_password(&mut child, auth).await;

    // 流式读 stdout：每行推送进度事件，同时累积完整输出
    let mut collected = String::new();
    if let Some(out) = child.stdout.take() {
        let mut lines = BufReader::new(out).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            emit_task_line(task_id, &line);
            collected.push_str(&line);
            collected.push('\n');
        }
    }

    let output = child.wait_with_output().await;
    untrack_task(task_id);
    let output = output.map_err(|e| SvnError::internal(format!("等待 svn 退出失败: {e}")))?;
    let duration_ms = started.elapsed().as_millis() as u64;

    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

    if output.status.success() {
        emit_console(ConsoleLine {
            command: display,
            output: truncate_for_console(&collected),
            success: true,
            duration_ms,
        });
        Ok(SvnOutput {
            stdout: collected,
            stderr,
        })
    } else {
        emit_console(ConsoleLine {
            command: display,
            output: truncate_for_console(&stderr),
            success: false,
            duration_ms,
        });
        // 被取消（SIGTERM）时 stderr 往往为空，给出明确错误
        if stderr.trim().is_empty() {
            Err(SvnError::new("CANCELLED", "操作已取消"))
        } else {
            Err(SvnError::from_stderr(&stderr))
        }
    }
}

/// 分配长任务 id。
pub fn next_task_id() -> u64 {
    TASK_SEQ.fetch_add(1, Ordering::Relaxed)
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
    exec_with(Some(dir), args, &AuthOptions::default(), true).await
}

/// 在工作副本目录下执行「查询类」命令（status/info/log/cat），控制台只记命令与耗时。
pub async fn query_in(dir: &str, args: &[&str]) -> Result<SvnOutput, SvnError> {
    exec_with(Some(dir), args, &AuthOptions::default(), false).await
}

/// 不指定工作目录、带认证执行「查询类」远端命令（list/info 远端 URL）。
pub async fn query_remote(args: &[&str], auth: &AuthOptions) -> Result<SvnOutput, SvnError> {
    exec_with(None, args, auth, false).await
}

/// 不指定工作目录、带认证执行「变更类」远端命令（remote copy 建分支/标签），
/// 成功输出进控制台。
pub async fn run_remote(args: &[&str], auth: &AuthOptions) -> Result<SvnOutput, SvnError> {
    exec_with(None, args, auth, true).await
}

/// 在工作副本目录下、带认证执行「变更类」命令（switch/merge），成功输出进控制台。
pub async fn run_in_auth(dir: &str, args: &[&str], auth: &AuthOptions) -> Result<SvnOutput, SvnError> {
    exec_with(Some(dir), args, auth, true).await
}
