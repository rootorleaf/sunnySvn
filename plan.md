# SunnySVN — 轻量级 macOS SVN 客户端

> 面向 Apple Silicon (M1+) 的轻量级 SVN 图形客户端，功能参考 SmartSVN，
> 基于 Tauri 2 + Rust + React 构建。

---

## 一、技术架构

```
┌──────────────────────────────────────┐
│  前端 React 18 + TS (系统 WebView)     │  文件状态表 / 提交 / 日志 / 差异对比
├──────────────── Tauri IPC ───────────┤
│  后端 Rust (Tauri 2 Core)             │  svn 子进程管理 · XML 解析 · 钥匙串 · 配置
├──────────────────────────────────────┤
│  svn CLI 1.14 (--xml 输出)            │  由 Homebrew 提供，启动时自动定位
└──────────────────────────────────────┘

安装包 ~15MB · 内存占用 ~100MB
```

### 前端
| 关注点 | 选型 | 理由 |
|---|---|---|
| 框架 | React 18 + TypeScript + Vite | 生态成熟、类型安全 |
| UI 组件 | Ant Design 5 | Tree / Table / Modal 开箱即用，适合桌面工具 |
| 状态管理 | Zustand | 轻量，无样板代码 |
| 差异对比 | CodeMirror 6 (`@codemirror/merge`) | 双栏 diff，比 Monaco 更轻 |
| 大列表 | `@tanstack/react-virtual` | 虚拟滚动，撑住大仓库 |

### 后端 (Rust)
| 关注点 | 选型 | 理由 |
|---|---|---|
| 运行时 | Tauri 2 + tokio | 异步子进程管理 |
| XML 解析 | quick-xml | 解析 svn `--xml` 输出 |
| 凭据存储 | `keyring` crate | 写入 macOS 钥匙串 |
| 配置存储 | JSON @ `~/Library/Application Support/sunnySvn/` | 工作副本列表、偏好设置 |

### SVN 引擎设计要点
- **二进制定位**：`PATH` → `/opt/homebrew/bin/svn` → `/usr/local/bin/svn` → 设置中手动指定；未安装则引导执行 `brew install subversion`。
- **查询命令统一 `--xml`**（status / info / log / list / blame），并强制 `LC_ALL=en_US.UTF-8` 保证解析稳定与中文路径正确。
- **认证**：全部 `--non-interactive`；密码存钥匙串，调用时通过 `--password-from-stdin`（svn 1.10+）传入，**绝不进入进程参数**；SSL 证书不受信 (E230001) → 弹窗确认后附加 `--trust-server-cert-failures`。
- **长任务**（checkout / update / commit）按行流式读取 stdout → 通过 Tauri event 推送进度，支持取消（kill 子进程）。
- **并发控制**：同一工作副本的写操作串行排队，读操作并行；svn 错误码映射为结构化错误（如 E170001 认证失败、E155004 需 cleanup、E160013 路径不存在）→ 前端弹对应对话框。

---

## 二、功能列表

### P0 — MVP（日常够用）
- [ ] 工作副本管理：添加 / 移除、侧栏列表、记住最近打开
- [ ] Checkout 向导（URL + 目标目录 + 认证）
- [ ] 状态视图：文件树 / 平铺两种模式，状态角标（M/A/D/?/!/C/ignored），手动刷新
- [ ] Update（更新）
- [ ] Commit（勾选文件 + 提交信息 + 历史信息复用）
- [ ] Add / Delete / Revert
- [ ] 差异对比：工作区 vs BASE 双栏 diff
- [ ] 日志视图：分页加载修订、提交信息、变更路径
- [ ] 认证：用户名密码 + 钥匙串保存 + SSL 信任提示
- [ ] 操作输出控制台

### P1 — 进阶版本管理
- [ ] 分支 / 标签（copy）、Switch 切换
- [ ] Merge 向导（分支 → 工作副本，展示结果 / 冲突）
- [ ] 冲突解决：冲突列表、采用我的 / 对方的、调用外部工具（FileMerge）
- [ ] 仓库浏览器（免 checkout 浏览远端、URL 直接操作）
- [ ] Blame 注释视图
- [ ] 属性编辑（svn:ignore、svn:externals）、右键加入忽略
- [ ] Cleanup / Lock / Unlock / Relocate
- [ ] 任意两个版本之间 diff

### P2 — 体验增强
- [ ] 文件监控自动刷新（notify + 防抖）、远端变更定时提醒（status -u）
- [ ] 深色模式跟随系统、快捷键、修订版本图（简化）
- [ ] 中 / 英多语言
- [ ] DMG 打包 + 签名公证

---

## 三、UI 布局（参考 SmartSVN 主窗口）

```
┌─────────────────────────────────────────────────┐
│ 工具栏: 更新 提交 还原 日志 分支 合并 …     [搜索]   │
├──────────┬──────────────────────────────────────┤
│ 侧栏      │ 文件状态表(路径/状态/修订/大小/修改时间)   │
│ ▾工作副本 │  ☑ src/main.rs        M              │
│  proj-a  │  ☑ src/svn/mod.rs     A              │
│ ▾仓库     ├──────────────────────────────────────┤
│  repo-1  │ 下部面板(Tab): 差异预览 / 输出控制台      │
├──────────┴──────────────────────────────────────┤
│ 状态栏: URL/分支 · Rev 1234 · 3 个修改             │
└─────────────────────────────────────────────────┘
```

独立对话框 / 窗口：提交、日志、仓库浏览器、冲突解决、设置。

---

## 四、目录结构

```
sunnySvn/
├── plan.md
├── package.json / vite.config.ts / tsconfig.json
├── src/                  # React 前端
│   ├── api/              # invoke 类型化封装
│   ├── stores/           # zustand
│   ├── components/       # FileStatusTable, DiffView …
│   └── views/            # WorkingCopyView, LogView, RepoBrowser …
└── src-tauri/            # Rust 后端
    └── src/
        ├── commands/     # Tauri IPC handlers
        ├── svn/          # locator / runner / parser / errors
        ├── auth.rs       # 钥匙串
        └── config.rs
```

---

## 五、里程碑

| 里程碑 | 内容 | 预估 |
|---|---|---|
| **M0 骨架** | 脚手架、svn 检测、添加工作副本、status 解析展示、update | ~1 周 |
| **M1 日常闭环** | commit / add / revert / delete、diff、log、控制台、错误处理 | 1–2 周 |
| **M2 认证与远端** | 钥匙串、checkout 向导、SSL 信任、仓库浏览器 | ~1 周 |
| **M3 分支合并** | branch / tag / switch / merge、冲突解决、blame、属性 | 1–2 周 |
| **M4 打磨发布** | 自动刷新、深色模式、大仓库性能、DMG 打包 | ~1 周 |

---

## 六、风险与对策

| 风险 | 对策 |
|---|---|
| svn 依赖 Homebrew | 启动检测 + 引导安装；后续评估捆绑 relocatable svn |
| 密码安全 | 钥匙串 + stdin 传递，绝不落盘 / 进参数 |
| 交互式提示卡死 | 全量 `--non-interactive`，错误码转 UI 对话框 |
| 大工作副本性能 | 虚拟列表、流式解析、增量刷新 |
| 中文路径 / 文件名 | 强制 UTF-8 locale，测试用例覆盖中文路径 |

---

## 七、验证策略

- 用 `svnadmin create` 建本地 `file://` 测试仓库，每个功能端到端走通：
  checkout → 改动 → status → commit → log。
- 每个里程碑完成后跑一遍完整回归。

---

## 附：本机环境（已确认就绪）

| 组件 | 版本 | 路径 |
|---|---|---|
| svn | 1.14.5 | `/opt/homebrew/bin/svn` |
| Node | 24.15.0 | nvm |
| Rust / cargo | 1.97.0 | `~/.cargo/bin/cargo` |
| 架构 | arm64 (Apple Silicon) | macOS 26.5 |
