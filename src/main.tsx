import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import App from "./App";
import "antd/dist/reset.css";
import "./styles.css";

// 跟随系统深色模式
const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { fontSize: 13, borderRadius: 4 },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
