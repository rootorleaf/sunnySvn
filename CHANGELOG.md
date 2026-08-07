# 更新日志 (Changelog)

本项目所有显著改动都记录在此文件中,新条目追加在最上方。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/);
在首个发布版本 (0.1.0) 之前,所有改动归入 `[Unreleased]`。

---

## [Unreleased]

### 2026-08-07 — 修复含 `@` 文件名提交失败(E200009 peg revision)
- **修复**:含 `@` 的文件名(如 iOS Retina 资源 `Icon@2x.png`、`iPad App-76@2x.png`)提交时报 `E200009: a peg revision is not allowed here`。根因是 svn 把路径里的 `@` 当作“路径与版本”分隔符,`@2x.png` 被解析为 peg 版本号。新增 `peg()` 转义:对含 `@` 的路径在末尾补一个 `@`(SVN 只认最后一个 `@`),并统一经 `path_args()` 拼装命令参数。覆盖所有传文件路径的 svn 子命令——`commit`(`--targets` 清单逐行转义)、`add`/`delete`/`revert`/`resolve`/`lock`/`unlock`/`blame`/`cat`/`proplist`/`propset`/`diff`。peg 转义仅作用于 svn 命令行参数,文件系统读写仍用原始路径。补 `peg`/`path_args` 单测。

### 2026-08-03 — 侧栏底部筛选器
- **新增**:侧栏底部增加筛选输入框(放大镜图标),按名称/路径实时过滤工作副本列表,不区分大小写,名称匹配用解码后的中文;可一键清空。筛选中列表为子集,拖动排序临时禁用避免下标错乱;无匹配时显示对应空态提示。

### 2026-08-03 — 深色主题整体提亮
- **变更**:深色模式主区域不再大片纯黑。antd `darkAlgorithm` 默认 Layout 背景为纯黑(#000)、容器为 #141414,深色时注入 token 覆盖为分层深灰(Layout #1f1f1f / 容器 #242424 / 浮层 #2c2c2c,边框 #3d3d3d),参考 VS Code 深色的层次感;自定义 CSS 变量同步提亮。
- **修复**:自定义 CSS 变量此前仅靠 `prefers-color-scheme` 媒体查询跟随系统,应用内主题选择与系统外观不一致时颜色错乱。ThemeProvider 现将生效主题写入 `<html data-theme>`,CSS 按其强制切换(媒体查询保留为首帧兜底);状态栏文字颜色改用变量。

### 2026-08-03 — 工具栏窄窗口自适应(溢出收进「更多」)
- **新增**:主视图顶部工具栏随窗口/侧栏宽度自适应:放不下的按钮按从右到左顺序自动收进「更多」下拉菜单顶部(与属性编辑/修订版本图/Cleanup 用分隔线隔开),窗口拉宽后自动还原。实现:隐藏测量行渲染全部按钮读真实宽度 + ResizeObserver 监听工具栏宽度,每次渲染后同步重算(语言切换、字号缩放自动覆盖);提交按钮的禁用态、更新按钮的加载态在菜单项里同步生效。

### 2026-08-03 — 侧栏顶部按钮整理
- **变更**:设置入口从侧栏底部挪到顶部按钮组最前(原底部设置栏移除);顶部的明暗主题切换按钮去掉(设置对话框内已有主题选项),`ThemeToggle` 组件随之删除。

### 2026-08-03 — 侧栏拖动排序 + 宽度可调 + 中文 URL 解码显示
- **新增**:工作副本列表支持拖动排序。因 Tauri 开启原生文件拖放后 macOS WKWebView 内 HTML5 DnD 不可用,改用 pointer 事件实现(按下移动超 5px 判定为拖动,否则仍视为点击选中;拖动中显示蓝色插入线,近边缘自动滚动)。新增 `reorder_working_copies` 命令将顺序持久化到 config.json,前端乐观更新失败时回读。
- **新增**:侧栏宽度可拖动调节。侧栏右缘 6px 拖动条(悬停/拖动显示蓝色高亮),范围 180–480px,宽度存 localStorage 重启后保留。
- **新增**:下部「差异/控制台」面板高度可拖动调节。面板顶缘拖动条上下拖,范围 120px 至窗口高度减 160px(给上方文件区留空间),高度同样存 localStorage。
- **修复**:svn 云端路径含中文时界面显示百分号编码乱码(如 `%E5%AE%9E%E5%90%8D-V4.4.24`)。新增 `decodeSvnText` 工具在显示层统一解码:侧栏名称、状态栏、切换/分支/合并对话框的当前 URL、仓库浏览器解析出的仓库地址(svn CLI 接受未编码 UTF-8 URL,解码后回传命令仍有效)。Checkout 目标目录名也从源头解码,新检出目录直接以真实中文命名,不再产生 `%XX` 目录。

### 2026-07-28 — 从 Finder 拖放添加工作副本
- **新增**:侧栏支持从 Finder 拖放目录添加工作副本。基于 Tauri `onDragDropEvent`(webview 全局事件),用侧栏矩形 + 指针坐标判定落点,拖入时显示高亮遮罩。支持多目录批量拖入,逐个校验,非工作副本在汇总弹窗列出原因。

### 2026-07-28 — M4.4 大仓库性能(虚拟滚动)
- **新增**:文件状态表启用 antd `virtual` 虚拟滚动,只渲染可视行,大工作副本(数千文件)滚动流畅。ResizeObserver 测容器宽高喂给 `scroll`,所有列设明确 width(虚拟表格必需)。
- **修复**:此前残留的未定义变量 `bodyW` 导致渲染抛错白屏,一并修正。

### 2026-07-28 — M4.1 文件监控自动刷新
- **新增**:工作副本文件监控(`watcher.rs`,notify crate)。切换工作副本时监视其目录(递归),本地文件变动经 500ms 防抖聚合后推送 `wc-changed` 事件,前端自动 `refreshStatus`,无需手动点刷新。
- **实现**:全局单例 watcher,切换工作副本自动替换上一个监控(`watch_working_copy`/`unwatch_working_copy`);忽略 `.svn` 内部变动与编辑器临时文件(`.tmp`/`.swp`/`.#`),避免 svn 自身操作与连续写入触发频繁刷新。
- **延后**:远端变更定时提醒(`status -u`)需认证且易产生噪音,暂缓;核心验收「本地文件改动后状态自动更新」已由文件监控满足。

### 2026-07-28 — 差异刷新与侧栏选中效果修复
- **修复**:解决冲突/还原等操作后差异面板不刷新。DiffView 之前只依赖 `selectedFile`/`wcPath` 变化重载，同一文件原地变化时看不到结果。appStore 新增 `statusVersion` 计数器,每次 `refreshStatus` 递增,DiffView 依赖它确定性重载。
- **修复**:工作副本侧栏选中项无高亮。多处组件引用了未定义的 CSS 变量(`--selected-bg`/`--border`/`--icon`/`--text-secondary`,实际只定义了 `--border-color`),补齐浅色/深色两套定义;选中项加左侧蓝色强调条(`.wc-item-selected`)。

### 2026-07-27 — M3 分支合并
- **新增**:分支/标签——`create_branch`(远端 copy，src URL → dst URL)，`BranchDialog` 按工作副本当前 URL 推断 repoRoot 下 branches/tags 目标；`switch_wc` + `SwitchDialog`(列出 trunk/branches/tags 候选，双击直切)。
- **新增**:Merge——`merge_into`(可选修订区间，`--accept postpone`)，`MergeDialog` 展示合并输出并识别冲突标记，完成后刷新状态。
- **新增**:冲突解决——`resolve_conflicts`(working/mine-full/theirs-full 等策略，白名单校验)，文件状态表右键对 conflicted 文件展开解决子菜单；状态栏显示「存在冲突」。
- **新增**:Blame——`get_blame` 解析 `svn blame --xml` 后用 cat 补齐每行正文(保留末尾空行、本地新增行补齐)，`BlameModal` 逐行显示修订/作者/内容。
- **新增**:属性编辑——`get_proplist`/`set_property`(propset -F 临时文件传多行值，空值走 propdel)，`PropertyDialog` 编辑任意属性；右键「加入忽略」`add_to_ignore` 追加父目录 svn:ignore。
- **新增**:其他远端操作——`cleanup_wc`(工具栏「更多」菜单)、`lock_files`/`unlock_files`、`relocate_wc`、`get_rev_diff`(任意两修订 unified diff)。
- **测试**:blame/proplist XML 解析新增单测(真实 svn 1.14 结构)，Rust 单测 16→18 全过；零警告编译，前端 tsc + vite build 通过。
- **说明**:分支/合并/switch/relocate 的远端认证需真实 https 仓库端到端验证；本地 file:// 仓库可验证 blame/属性/cleanup/rev-diff。

### 2026-07-26 — 仓库浏览器自动解析工作副本路径
- **新增**:仓库浏览器输入本地工作副本路径(裸路径或 `file://`)时,后端 `resolve_repo_url` 检测到 `.svn` 目录后读出其真实仓库 URL 并自动切换,附「已识别为工作副本,自动切换到其仓库地址」提示。此前用户误把工作副本路径当仓库地址填,svn 甩出一串 `%XX` 转义的 E170013/E180001 难以理解。
- **变更**:「浏览」按钮放开对 `://` 的限制,允许输入本地路径。

### 2026-07-26 — 差异视图目录提示
- **修复**:在状态表点击目录项时,差异面板显示两栏空白。目录没有文本内容,现后端返回 IS_DIRECTORY,前端显示「目录没有可对比的内容」提示(与二进制文件同为信息级,非错误)。

### 2026-07-26 — 路径实体转义修复
- **修复**:XML 属性未做反转义,路径含 `&` 等字符时解析成 `&amp;` 字面量,「在 Finder 中显示」等按路径操作报「路径不存在」(用户实测:`接口文档&demo` 目录)。`attr()` 改用 `unescape_value()`,status/info/log/list 所有属性解析同步受益;新增含 `&` 与中文的回归单测,并对真实 svn 输出验证转义行为。

### 2026-07-26 — M2 认证与远端
- **新增**:凭据管理 `auth.rs`——keyring(apple-native) 按 realm(scheme://host:port) 存取 macOS 钥匙串;密码经 `--password-from-stdin` 从标准输入传给 svn,不进进程参数、不落盘,控制台展示的命令行不含认证信息。
- **新增**:Checkout 向导——URL/目标目录/认证折叠栏;后端 `start_checkout` 异步任务,`svn-task-progress` 逐行进度、`svn-task-done` 完成事件,`cancel_task` 发 SIGTERM 可取消;完成自动加入工作副本列表。E170001 自动展开认证栏,E230001 显示「信任该证书并重试」(附加 `--trust-server-cert-failures`)。
- **新增**:仓库浏览器——`list_repo` 解析 `svn list --xml`(对真实 svn 1.14 输出验证),免 checkout 浏览远端;面包屑导航、目录下钻、修订/作者/日期/大小列;同样支持认证与 SSL 信任重试。
- **新增**:侧栏头部新增「仓库浏览器」「Checkout」入口;凭据查询/删除命令(`get_saved_credential` 只返回用户名)。
- **变更**:执行器重构——全局选项统一前置,支持认证注入与流式长任务(RUNNING_TASKS 表跟踪 PID 供取消)。
- **测试**:单元测试 11→15(realm 提取、list 解析含中文/size、checkout 修订号提取、远端 URL 校验);真实 svn 验证 list/checkout 参数顺序与输出结构。

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
