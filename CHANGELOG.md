# 更新日志 (Changelog)

本项目所有显著改动都记录在此文件中,新条目追加在最上方。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/);
在首个发布版本 (0.1.0) 之前,所有改动归入 `[Unreleased]`。

---

## [Unreleased]

### 2026-07-24 — 工程调整
- **变更**:`plan.md`、`task-list.md` 改为仅本地保留,不再提交到 GitHub(加入 .gitignore 并从远端移除)。(`919a087`)

### 2026-07-24 — M0 骨架
- **新增**:Tauri 2 + React 18 + TypeScript + Vite 项目脚手架,含 Ant Design 5、Zustand、@ant-design/icons。(`69e93b3`)
- **新增**:Rust svn 引擎四层结构——二进制定位 (`locator`)、子进程执行器 (`runner`,强制 UTF-8 locale + `--non-interactive`)、`--xml` 输出解析 (`parser`,覆盖 status/info)、错误码映射 (`errors`,E###### 提取)。
- **新增**:8 个 Tauri IPC 命令:`detect_svn`、`get_status`、`get_info`、`is_working_copy`、`update_working_copy`、`list/add/remove_working_copy`。
- **新增**:工作副本列表持久化到 `~/Library/Application Support/com.rootorleaf.sunnysvn/config.json`(sha256 路径哈希做稳定 id)。
- **新增**:前端界面骨架——工作副本侧栏(添加/移除/选中)、文件状态表(M/A/D/?/!/C/ignored 角标)、更新/刷新工具栏、svn 缺失引导页 (SvnGuard)、深色模式跟随系统。
- **新增**:应用图标(太阳主题,tauri icon 全套生成)。
- **测试**:6 个 Rust 单元测试(错误码提取、status/info XML 解析、update 修订号提取)全部通过;TS 类型检查、前后端构建均通过。
- **测试**:本地 `file://` 测试仓库脚手架(`/tmp/sunnysvn-test`),真实 XML 输出与解析器验证吻合。

### 2026-07-24 — 项目启动
- **新增**:项目设计方案 (plan.md) 与任务拆解 (task-list.md),确定 Tauri 2 + Rust + React 技术栈、P0/P1/P2 功能分级、M0–M4 里程碑。(`cefd6fd`)
- **工程**:本地 git 仓库初始化,关联 GitHub `rootorleaf/sunnySvn`,配置 gh CLI 认证。(`03d2b5d`..)
