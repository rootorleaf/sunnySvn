// svn 子进程执行器：统一注入 UTF-8 locale 与 --non-interactive，
// 捕获 stdout/stderr，非零退出码映射为结构化 SvnError。

use std::process::Stdio;
use tokio::process::Command;

use super::errors::SvnError;
use super::locator::svn_path;

/// 一次 svn 调用的结果
pub struct SvnOutput {
    pub stdout: String,
    // M2 认证/远端操作会读取 stderr 做 SSL 信任等分支处理
    #[allow(dead_code)]
    pub stderr: String,
}

/// 执行 svn 命令（不指定工作目录）。`args` 不含 "svn" 本身。
/// M2 的 checkout / 仓库浏览器等无工作副本上下文的操作会用到。
///
/// - 强制 `LC_ALL=en_US.UTF-8` / `LANG`，保证 --xml 输出与中文路径解析稳定；
/// - 统一追加 `--non-interactive`，避免交互提示卡死；
/// - 非零退出码 → 从 stderr 提取错误码返回 Err。
#[allow(dead_code)]
pub async fn run(args: &[&str]) -> Result<SvnOutput, SvnError> {
    let bin = svn_path()?;

    let mut cmd = Command::new(&bin);
    cmd.args(args)
        .arg("--non-interactive")
        .env("LC_ALL", "en_US.UTF-8")
        .env("LANG", "en_US.UTF-8")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let output = cmd
        .output()
        .await
        .map_err(|e| SvnError::internal(format!("无法执行 svn: {e}")))?;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

    if output.status.success() {
        Ok(SvnOutput { stdout, stderr })
    } else {
        Err(SvnError::from_stderr(&stderr))
    }
}

/// 在指定工作副本目录下执行（等价于先 cd）。多数 svn 命令接受路径参数，
/// 但用 current_dir 更贴近用户直觉，也避免路径拼接的转义问题。
pub async fn run_in(dir: &str, args: &[&str]) -> Result<SvnOutput, SvnError> {
    let bin = svn_path()?;

    let mut cmd = Command::new(&bin);
    cmd.args(args)
        .arg("--non-interactive")
        .current_dir(dir)
        .env("LC_ALL", "en_US.UTF-8")
        .env("LANG", "en_US.UTF-8")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let output = cmd
        .output()
        .await
        .map_err(|e| SvnError::internal(format!("无法执行 svn: {e}")))?;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

    if output.status.success() {
        Ok(SvnOutput { stdout, stderr })
    } else {
        Err(SvnError::from_stderr(&stderr))
    }
}
