import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 期望前端固定端口且不自动打开浏览器
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Rust 侧文件由 cargo 监听，Vite 无需理会
      ignored: ["**/src-tauri/**"],
    },
  },
  // Tauri 使用固定的 dist 目录
  build: {
    target: "safari15",
    minify: "esbuild",
    sourcemap: false,
  },
});
