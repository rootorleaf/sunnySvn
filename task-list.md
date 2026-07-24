# SunnySVN — 任务拆解清单

> 依据 [plan.md](./plan.md) 拆解。按里程碑 M0–M4 组织，每项任务标注所属功能与验收标准。
> 状态标记：`[ ]` 待办 · `[~]` 进行中 · `[x]` 完成

---

## M0 — 骨架（约 1 周）

目标：项目可运行，能添加工作副本并展示 `svn status`，能执行 update。

### 0.1 项目脚手架
- [x] 初始化 Tauri 2 + React 18 + TS + Vite 项目结构
- [x] 配置 `package.json` / `vite.config.ts` / `tsconfig.json`
- [x] 配置 `src-tauri/`（Cargo.toml、tauri.conf.json）
- [x] 引入前端依赖：Ant Design 5、Zustand、@ant-design/icons（CodeMirror / react-virtual 延后到 M1 diff / 大列表时引入）
- [x] 引入后端依赖：tokio、quick-xml、serde、thiserror、sha2（keyring 延后到 M2 认证）
- [x] 建立目录结构（src/api、stores、components、views；src-tauri/src/commands、svn）
- [~] `npm run tauri dev` 能启动空白窗口（代码就绪，无头环境未实际启动窗口，待有 GUI 时验证）
- **验收**：TS 检查通过、Rust 零警告编译、前后端 build 均成功、6 个单元测试全过；实际窗口启动待 GUI 验证

### 0.2 SVN 二进制定位
- [x] `svn/locator.rs`：PATH → /opt/homebrew/bin/svn → /usr/local/bin/svn（手动指定延后到设置页）
- [x] 未检测到时返回结构化错误（SVN_NOT_FOUND），前端 `SvnGuard` 引导 `brew install subversion`
- [x] 读取并展示 `svn --version`
- **验收**：本机能定位到 svn 1.14.5，缺失时给出引导提示

### 0.3 SVN 命令执行器
- [x] `svn/runner.rs`：封装子进程调用，强制 `LC_ALL=en_US.UTF-8`，统一 `--non-interactive`
- [x] 捕获 stdout / stderr / exit code
- [x] 基础错误码映射骨架（`svn/errors.rs`，含 E###### 提取 + 单元测试）
- **验收**：能执行任意 svn 只读命令并拿到原始输出

### 0.4 status 解析与展示
- [x] `svn/parser.rs`：解析 `svn status --xml`（含单元测试，覆盖自闭合与带 commit 子节点两种形态）
- [x] `commands/`：暴露 `get_status(path)` IPC
- [x] 前端 `FileStatusTable` 组件：路径 / 状态角标（M/A/D/?/!/C/ignored）
- [x] 手动刷新按钮
- **验收**：解析器对真实测试仓库 XML 输出结构验证通过；前端组件就绪，端到端展示待 GUI 验证

### 0.5 工作副本管理（基础）
- [x] `config.rs`：JSON 配置存储于 `~/Library/Application Support/com.rootorleaf.sunnysvn/`
- [x] 添加 / 移除工作副本（sha256 路径哈希做稳定 id），侧栏列表
- [x] 选中工作副本后加载其 status
- **验收**：逻辑就绪、编译通过；端到端交互待 GUI 验证

### 0.6 Update
- [x] `commands/`：暴露 `update_working_copy(path)` IPC（解析尾部修订号）
- [x] 前端工具栏「更新」按钮，完成后刷新 status
- **验收**：命令与按钮就绪；端到端 update 待 GUI 验证

### 0.7 测试仓库脚手架
- [x] 用 `svnadmin create` 建本地 `file://` 测试仓库（`/tmp/sunnysvn-test/repo`），验证 status/info XML 输出
- [~] 中文路径样例（基础仓库已建，中文路径用例待补脚本固化）
- **验收**：已建可用测试仓库，XML 输出结构与解析器假设吻合

---

## M1 — 日常闭环（1–2 周）

目标：commit / add / revert / delete、diff、log、控制台、错误处理全通。

### 1.1 Commit
- [ ] `commands/`：`commit(paths, message)` IPC
- [ ] 提交对话框：勾选文件 + 提交信息输入 + 历史信息复用
- [ ] 提交后刷新 status
- **验收**：勾选改动文件提交成功，日志出现新修订

### 1.2 Add / Delete / Revert
- [ ] `commands/`：`add` / `delete` / `revert` IPC
- [ ] 文件状态表右键菜单接入
- **验收**：新增文件可 add、已跟踪文件可 delete、改动可 revert，状态即时更新

### 1.3 差异对比（工作区 vs BASE）
- [ ] `commands/`：`diff(path)` 返回 diff 文本或双侧内容
- [ ] `DiffView` 组件：CodeMirror 6 `@codemirror/merge` 双栏
- [ ] 下部面板 Tab 集成
- **验收**：选中修改文件展示双栏 diff，中文内容正确

### 1.4 日志视图
- [ ] `commands/`：`get_log(path, limit, offset)` 解析 `svn log --xml`
- [ ] `LogView`：分页加载修订、提交信息、变更路径
- **验收**：分页加载历史修订，点击查看变更路径

### 1.5 操作输出控制台
- [ ] 下部面板「输出控制台」Tab
- [ ] 后端命令输出通过 Tauri event 流式推送到控制台
- **验收**：每次 svn 操作的命令与输出可见

### 1.6 错误处理体系
- [ ] 完善错误码映射（E170001 认证、E155004 需 cleanup、E160013 路径不存在等）
- [ ] 前端统一错误对话框
- **验收**：常见错误场景弹出对应可读提示

---

## M2 — 认证与远端（约 1 周）

目标：钥匙串、checkout 向导、SSL 信任、仓库浏览器。

### 2.1 认证与钥匙串
- [ ] `auth.rs`：keyring 读写 macOS 钥匙串
- [ ] 认证对话框（用户名 / 密码 / 记住）
- [ ] 密码通过 `--password-from-stdin` 传入，绝不进参数 / 落盘
- **验收**：认证仓库操作成功，密码存于钥匙串，重启后免输入

### 2.2 SSL 证书信任
- [ ] 捕获 E230001 → 弹窗展示证书信息
- [ ] 确认后附加 `--trust-server-cert-failures` 重试
- **验收**：自签名证书仓库确认后可访问

### 2.3 Checkout 向导
- [ ] `commands/`：`checkout(url, dest, auth)`，流式进度 + 可取消（kill 子进程）
- [ ] 向导 UI：URL + 目标目录 + 认证
- [ ] 完成后加入工作副本列表
- **验收**：从远端 checkout 成功，进度可见、可取消

### 2.4 仓库浏览器
- [ ] `commands/`：`list(url)` 解析 `svn list --xml`
- [ ] `RepoBrowser`：免 checkout 浏览远端目录树
- **验收**：输入 URL 可浏览远端目录结构

---

## M3 — 分支合并（1–2 周）

目标：branch / tag / switch / merge、冲突解决、blame、属性。

### 3.1 分支 / 标签 / Switch
- [ ] `commands/`：`copy`（branch/tag）、`switch`
- [ ] UI：创建分支/标签对话框、切换分支
- **验收**：创建分支成功，工作副本可切换

### 3.2 Merge 向导
- [ ] `commands/`：`merge(source, wc)`
- [ ] 向导展示合并结果 / 冲突
- **验收**：分支合并到工作副本，结果正确展示

### 3.3 冲突解决
- [ ] 冲突列表视图
- [ ] 采用我的 / 对方的 / 调用外部工具（FileMerge）
- [ ] `resolve` 命令接入
- **验收**：制造冲突后可通过 UI 解决并标记 resolved

### 3.4 Blame 注释视图
- [ ] `commands/`：解析 `svn blame --xml`
- [ ] Blame 视图（行级作者 / 修订）
- **验收**：文件展示逐行 blame 信息

### 3.5 属性编辑
- [ ] `svn:ignore` / `svn:externals` 编辑
- [ ] 右键「加入忽略」
- **验收**：可编辑属性并提交，忽略生效

### 3.6 其他远端操作
- [ ] Cleanup / Lock / Unlock / Relocate
- [ ] 任意两个版本之间 diff
- **验收**：各命令可执行并反馈结果

---

## M4 — 打磨发布（约 1 周）

目标：自动刷新、深色模式、性能、DMG 打包公证。

### 4.1 自动刷新
- [ ] 文件监控（notify crate + 防抖）自动刷新 status
- [ ] 远端变更定时提醒（`status -u`）
- **验收**：本地文件改动后状态自动更新

### 4.2 体验增强
- [ ] 深色模式跟随系统
- [ ] 快捷键
- [ ] 修订版本图（简化）
- **验收**：切换系统外观主题跟随

### 4.3 多语言
- [ ] 中 / 英 i18n
- **验收**：可切换界面语言

### 4.4 大仓库性能
- [ ] 虚拟列表、流式解析、增量刷新压测
- **验收**：大工作副本下滚动与刷新流畅

### 4.5 打包发布
- [ ] DMG 打包 + 代码签名 + 公证（notarization）
- [ ] 产物为 aarch64 (Apple Silicon)
- **验收**：生成可分发 DMG，Gatekeeper 通过

---

## 贯穿性任务（每个里程碑收尾执行）

- [ ] 端到端回归：checkout → 改动 → status → commit → log
- [ ] 中文路径 / 文件名用例覆盖
- [ ] 更新 plan.md / task-list.md 勾选进度
