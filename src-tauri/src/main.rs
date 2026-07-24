// 桌面端二进制入口：关闭 Windows 控制台窗口（macOS 无影响），委托给 lib。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sunnysvn_lib::run();
}
