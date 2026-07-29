// 主题切换：跟随系统 / 浅色 / 深色 三档。点击图标弹出菜单选择。

import { BgColorsOutlined, DesktopOutlined, SunOutlined, MoonOutlined } from "@ant-design/icons";
import { Dropdown, type MenuProps } from "antd";
import { useTheme, type ThemeMode } from "../theme/ThemeProvider";

const MODE_LABEL: Record<ThemeMode, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
};

export function ThemeToggle() {
  const { mode, setMode } = useTheme();

  const items: MenuProps["items"] = [
    {
      key: "system",
      label: (
        <span>
          <DesktopOutlined style={{ marginRight: 6 }} />
          跟随系统
        </span>
      ),
    },
    {
      key: "light",
      label: (
        <span>
          <SunOutlined style={{ marginRight: 6 }} />
          浅色
        </span>
      ),
    },
    {
      key: "dark",
      label: (
        <span>
          <MoonOutlined style={{ marginRight: 6 }} />
          深色
        </span>
      ),
    },
  ];

  return (
    <Dropdown
      trigger={["click"]}
      menu={{
        items,
        selectedKeys: [mode],
        onClick: ({ key }) => setMode(key as ThemeMode),
      }}
    >
      <button
        className="theme-toggle-btn"
        title={`主题：${MODE_LABEL[mode]}`}
      >
        <BgColorsOutlined />
      </button>
    </Dropdown>
  );
}
