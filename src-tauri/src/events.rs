// 控制台事件：把每次 svn 命令的执行情况推送给前端「输出控制台」。
// AppHandle 在应用 setup 时注入；窗口未就绪时事件静默丢弃。

use serde::Serialize;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};

static APP: OnceLock<AppHandle> = OnceLock::new();

/// 在 tauri setup 阶段调用一次。
pub fn set_app_handle(app: AppHandle) {
    let _ = APP.set(app);
}

/// 一条控制台记录，字段与前端 ConsoleLine 对齐（camelCase）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleLine {
    /// 展示用命令行，如 `svn update @ /path/to/wc`
    pub command: String,
    /// 命令输出（查询类命令成功时为空，避免 XML 噪音刷屏）
    pub output: String,
    pub success: bool,
    pub duration_ms: u64,
}

/// 推送一条控制台记录到前端。
pub fn emit_console(line: ConsoleLine) {
    if let Some(app) = APP.get() {
        let _ = app.emit("svn-console", &line);
    }
}
