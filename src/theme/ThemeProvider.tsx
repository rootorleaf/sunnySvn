import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ConfigProvider, theme as antdTheme } from "antd";

export type ThemeMode = "system" | "light" | "dark";

type ThemeCtx = {
  isDark: boolean; // 实际生效的深浅
  mode: ThemeMode; // 用户选择
  setMode: (m: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeCtx>({
  isDark: false,
  mode: "system",
  setMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const STORAGE_KEY = "sunnysvn.theme";

function readStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* 忽略 */
  }
  return "system";
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * 应用内主题切换：system / light / dark 三档。
 * - system：跟随系统外观，运行时自动响应切换；
 * - light/dark：强制固定，不受系统影响。
 * 选择持久化到 localStorage。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

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

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* 忽略 */
    }
  };

  const value = useMemo(() => ({ isDark, mode, setMode }), [isDark, mode]);

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        theme={{
          algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: { fontSize: 13, borderRadius: 4 },
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}
