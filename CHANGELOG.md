# 更新日志 (Changelog)

本项目所有显著改动都记录在此文件中,新条目追加在最上方。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/);
在首个发布版本 (0.1.0) 之前,所有改动归入 `[Unreleased]`。

---

## [Unreleased]

### 2026-07-26 — 在 Finder 中显示
- **新增**:`reveal_in_finder` IPC(macOS `open -R`,定位并选中)。侧栏工作副本右键菜单:「在 Finder 中显示 / 从列表移除」;文件状态表右键菜单同步加入该项(已删除/丢失文件除外,磁盘上不存在)。

### 2026-07-26 — M1 缺陷修复
- **修复**:执行器把 `--non-interactive` 追加在参数末尾,落到 `--` 分隔符之后被 svn 当成路径,导致 add/revert/delete 报 `W155010 + E200009`(提交对话框勾选未版本化文件时触发,先行的自动 add 即失败)。现改为前置该选项;已对真实 svn 复现原错并验证修复,status/commit/log/update 兼容。
- **修复**:文件状态表右键菜单点击空白处无法关闭(受控 Dropdown `trigger=[]` 不监听外部点击)。补充全局 mousedown(捕获阶段,菜单浮层与锚点区域除外)与 Esc 监听,点外部或按 Esc 即关闭。

### 2026-07-24 — M1 日常闭环
- **新增**:提交能力——`commit_files` IPC(--targets 临时文件传路径,规避参数长度限制)、提交对话框(勾选文件、未版本化自动先 add、提交信息历史复用,历史存 config.json 上限 20 条)。
- **新增**:文件操作——`add_files` / `delete_files`(版本化走 `svn delete --force`,未版本化直接删磁盘)/ `revert_files`,状态表右键菜单接入,危险操作二次确认;相对路径安全校验(拒绝绝对路径与 `..`)。
- **新增**:双栏差异——`get_file_diff` 返回 BASE(`svn cat -r BASE`)与工作区内容,CodeMirror 6 MergeView 渲染,折叠未变更区段;二进制/非 UTF-8 检测(BINARY_FILE)。
- **新增**:日志视图——`get_log` 解析 `svn log --xml -v`,LogModal 分页加载(每页 50,按 revision-1 翻页),展开行显示变更路径。
- **新增**:输出控制台——后端每条 svn 命令经 `svn-console` 事件推送(命令/耗时/成败;查询类成功不推正文,失败推 stderr,超 8000 字符截断),前端保留 500 条、自动滚底。
- **新增**:统一错误对话框,错误码映射扩展至 16 项(E170001 认证、E155004 需 cleanup、E230001 证书不受信等)。
- **新增**:`scripts/make-test-repo.sh` 一键重建测试仓库(中文路径 + M/A/D/?/! 状态样例)。
- **测试**:Rust 单元测试 6→11 个(log 解析中文/实体/空 msg、提交修订号提取、路径校验、二进制检测);`--targets` 提交输出、中文路径 `cat`、`log --xml` 真实结构均对实际 svn 验证。
- **修复**:CommitDialog 历史信息 `Select` 的 `onSelect` 类型不匹配(`value={null}` 致泛型推断出 `string | null`),改用 `undefined` 并显式指定泛型。
- **验证**:TS 类型检查、vite 生产构建、Rust 零警告编译均通过;`npm run tauri:dev` 实机启动窗口成功(补齐此前缺失的 GUI 验证)。

### 2026-07-24 — 命名规范
- **约定**:对外/文档统一使用 **SunnySVN**;代码与接口标识(npm 包名 `sunnysvn`、crate 名、bundle id `com.rootorleaf.sunnysvn`、仓库名 `sunnySvn`)保持不变。
- **变更**:README.md 按规范重写(SunnySVN 品牌、环境要求、开发命令、技术架构)。
- **修复**:`src/api/config.ts` 注释中的配置存储路径与实际实现不一致(`sunnySvn/` → `com.rootorleaf.sunnysvn/`)。

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
