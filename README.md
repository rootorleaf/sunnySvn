# SunnySVN

适用于 macOS (Apple Silicon) 的极致精简 SVN 客户端。

基于 Tauri 2 + Rust + React 构建,通过系统 `svn` 命令行完成版本控制操作,安装包轻量、内存占用低。

## 环境要求

- macOS 11+ (Apple Silicon)
- Subversion 命令行工具:`brew install subversion`

## 开发

```bash
npm install          # 安装依赖
npm run tauri:dev    # 启动开发窗口
npm run tauri:build  # 打包 .app / DMG
```

## 技术架构

| 层 | 选型 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Ant Design 5 + Zustand |
| 后端 | Rust (Tauri 2) — svn 子进程管理、`--xml` 输出解析、配置持久化 |
| SVN | 系统 `svn` CLI (Homebrew),强制 UTF-8 locale + `--non-interactive` |
