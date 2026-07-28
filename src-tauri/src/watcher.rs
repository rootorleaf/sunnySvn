// 工作副本文件监控：切换工作副本时监视其目录，本地文件变动经防抖后
// 推送 `wc-changed` 事件，前端据此自动刷新 status。
//
// 设计：全局单例 watcher（同一时刻只监控当前选中的工作副本）。
// - 切换/进入工作副本时调 watch()，替换掉上一个监控；
// - 变动事件先入去抖通道，静默 500ms 后聚合推送一次，避免保存/编译等
//   连续写入触发状态表频繁刷新；
// - 忽略 .svn 内部变动（svn 自身操作会大量改写 .svn，不代表用户改动）。

use std::path::Path;
use std::sync::mpsc::{channel, Receiver};
use std::sync::Mutex;
use std::time::Duration;

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

/// 去抖窗口：连续变动在此窗口内聚合为一次刷新。
const DEBOUNCE: Duration = Duration::from_millis(500);

/// 当前活动的 watcher。持有它以维持监控；替换或置空即停止上一次监控。
static ACTIVE: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);

/// 判断变动路径是否应忽略（.svn 内部、临时文件）。
fn should_ignore(event: &Event) -> bool {
    event.paths.iter().all(|p| {
        p.components().any(|c| c.as_os_str() == ".svn")
            || p.file_name()
                .map(|n| {
                    let n = n.to_string_lossy();
                    // svn 临时/锁文件与常见编辑器交换文件
                    n.ends_with(".tmp") || n.ends_with(".swp") || n.starts_with(".#")
                })
                .unwrap_or(false)
    })
}

/// 开始监控指定工作副本目录（替换上一个）。路径无效时返回错误字符串。
pub fn watch(app: AppHandle, path: &str) -> Result<(), String> {
    let dir = Path::new(path);
    if !dir.is_dir() {
        return Err(format!("不是有效目录: {path}"));
    }

    let (tx, rx) = channel::<notify::Result<Event>>();
    let mut watcher = notify::recommended_watcher(move |res| {
        // 发送失败说明接收端已释放（watcher 被替换），忽略即可
        let _ = tx.send(res);
    })
    .map_err(|e| format!("创建文件监控失败: {e}"))?;

    watcher
        .watch(dir, RecursiveMode::Recursive)
        .map_err(|e| format!("监控目录失败: {e}"))?;

    // 去抖聚合线程：收到有效变动后等待静默窗口，其间的变动一并吞掉，再推一次
    let path_owned = path.to_string();
    std::thread::spawn(move || debounce_loop(app, path_owned, rx));

    // 替换全局 watcher（drop 掉旧的即停止旧监控）
    let mut active = ACTIVE.lock().unwrap();
    *active = Some(watcher);
    Ok(())
}

/// 停止当前监控（前端移除工作副本或无选中时调用）。
pub fn unwatch() {
    let mut active = ACTIVE.lock().unwrap();
    *active = None;
}

/// 去抖循环：阻塞等首个有效变动，然后在 DEBOUNCE 窗口内持续吞掉后续变动，
/// 窗口静默后推送一次 `wc-changed`。channel 断开（watcher 被替换）时退出。
fn debounce_loop(app: AppHandle, path: String, rx: Receiver<notify::Result<Event>>) {
    loop {
        // 阻塞等待首个变动；发送端全部释放则退出线程
        let first = match rx.recv() {
            Ok(r) => r,
            Err(_) => break,
        };
        if !is_relevant(&first) {
            continue;
        }
        // 进入去抖窗口：把窗口内的后续变动全部排空
        loop {
            match rx.recv_timeout(DEBOUNCE) {
                Ok(_) => continue,          // 窗口内又有变动，继续等
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => break, // 静默，推送
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
            }
        }
        let _ = app.emit("wc-changed", &path);
    }
}

/// 变动是否值得触发刷新（有效事件且非忽略路径）。
fn is_relevant(res: &notify::Result<Event>) -> bool {
    match res {
        Ok(ev) => !should_ignore(ev),
        Err(_) => false,
    }
}
