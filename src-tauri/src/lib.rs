// 应用入口库：注册插件与 IPC 命令，桌面端与移动端复用。

mod auth;
mod commands;
mod events;
mod svn;

use commands::{config_cmd, remote_cmd, svn_cmd, system_cmd};

/// 构建并运行 Tauri 应用。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 控制台事件需要 AppHandle 才能向前端推送
            events::set_app_handle(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            svn_cmd::detect_svn,
            svn_cmd::get_status,
            svn_cmd::get_info,
            svn_cmd::is_working_copy,
            svn_cmd::update_working_copy,
            svn_cmd::commit_files,
            svn_cmd::add_files,
            svn_cmd::delete_files,
            svn_cmd::revert_files,
            svn_cmd::get_file_diff,
            svn_cmd::get_log,
            config_cmd::list_working_copies,
            config_cmd::add_working_copy,
            config_cmd::remove_working_copy,
            config_cmd::list_recent_messages,
            system_cmd::reveal_in_finder,
            remote_cmd::list_repo,
            remote_cmd::start_checkout,
            remote_cmd::cancel_task,
            remote_cmd::get_saved_credential,
            remote_cmd::delete_saved_credential,
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时发生错误");
}
