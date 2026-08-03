import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import { useI18n } from "../i18n";

export type ThemeMode = "system" | "light" | "dark";
export type FontScale = "small" | "medium" | "large";

/** 字号档位 → 基础字号（px） */
const FONT_PX: Record<FontScale, number> = { small: 12, medium: 13, large: 15 };

type ThemeCtx = {
  isDark: boolean; // 实际生效的深浅
  mode: ThemeMode; // 用户选择的主题
  setMode: (m: ThemeMode) => void;
  fontScale: FontScale; // 用户选择的字号档
  setFontScale: (f: FontScale) => void;
};

const ThemeContext = createContext<ThemeCtx>({
  isDark: false,
  mode: "system",
  setMode: () => {},
  fontScale: "medium",
  setFontScale: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const THEME_KEY = "sunnysvn.theme";
const FONT_KEY = "sunnysvn.fontScale";

function readStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* 忽略 */
  }
  return "system";
}

function readStoredFont(): FontScale {
  try {
    const v = localStorage.getItem(FONT_KEY);
    if (v === "small" || v === "medium" || v === "large") return v;
  } catch {
    /* 忽略 */
  }
  return "medium";
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * 应用内主题 + 字号设置。
 * - 主题 system / light / dark：system 跟随系统外观并实时响应；
 * - 字号 small / medium / large：注入 antd token 全局生效；
 * 均持久化到 localStorage。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [fontScale, setFontScaleState] = useState<FontScale>(readStoredFont);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const { locale } = useI18n();

  // 监听系统外观变化（仅 mode === system 时影响 isDark）
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  const isDark = mode === "system" ? systemDark : mode === "dark";

  // 把生效主题同步到 <html data-theme>，styles.css 里的自定义变量据此切换
  // （不能只靠 prefers-color-scheme 媒体查询：应用内选择可能与系统外观不同）
  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
  }, [isDark]);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem(THEME_KEY, m);
    } catch {
      /* 忽略 */
    }
  };

  const setFontScale = (f: FontScale) => {
    setFontScaleState(f);
    try {
      localStorage.setItem(FONT_KEY, f);
    } catch {
      /* 忽略 */
    }
  };

  const value = useMemo(
    () => ({ isDark, mode, setMode, fontScale, setFontScale }),
    [isDark, mode, fontScale],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        locale={locale === "zh" ? zhCN : enUS}
        theme={{
          algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            fontSize: FONT_PX[fontScale],
            borderRadius: 4,
            // 深色整体提亮：darkAlgorithm 默认 Layout 纯黑(#000)、容器 #141414 太黑，
            // 改用分层深灰（参考 VS Code 深色的层次感）
            ...(isDark
              ? {
                  colorBgLayout: "#1f1f1f",
                  colorBgContainer: "#242424",
                  colorBgElevated: "#2c2c2c",
                  colorBorder: "#3d3d3d",
                  colorBorderSecondary: "#333333",
                }
              : {}),
          },
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}
