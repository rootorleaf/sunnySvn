// 轻量 i18n：以中文原文为 key，中文态原样返回，英文态查 en.ts 字典。
// t() 是普通函数（读模块级当前语言），组件外的工具代码（errorDialog、store）也能用；
// 切换语言时 Provider 用 key 重挂载子树，保证所有 t() 调用点重新求值。
// 后端（Rust/svn 本身）的错误消息不在此翻译范围内。

import { Fragment, createContext, useContext, useEffect, useState, type ReactNode } from "react";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { EN } from "./en";

export type Locale = "zh" | "en";

const LOCALE_KEY = "sunnysvn.locale";

function readStored(): Locale {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    if (v === "zh" || v === "en") return v;
  } catch {
    /* 忽略 */
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

let currentLocale: Locale = readStored();

/** 翻译：中文原文作 key；文案里的 {0}/{1} 占位符用后续参数替换 */
export function t(text: string, ...args: (string | number)[]): string {
  let out = currentLocale === "zh" ? text : EN[text] ?? text;
  for (let i = 0; i < args.length; i++) {
    out = out.replace(`{${i}}`, String(args[i]));
  }
  return out;
}

const I18nContext = createContext<{ locale: Locale; setLocale: (l: Locale) => void }>({
  locale: currentLocale,
  setLocale: () => {},
});

export function useI18n() {
  return useContext(I18nContext);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(currentLocale);
  // 渲染期同步模块级变量，子树里的 t() 即刻用到新语言
  currentLocale = locale;

  useEffect(() => {
    dayjs.locale(locale === "zh" ? "zh-cn" : "en");
  }, [locale]);

  const setLocale = (l: Locale) => {
    currentLocale = l;
    setLocaleState(l);
    try {
      localStorage.setItem(LOCALE_KEY, l);
    } catch {
      /* 忽略 */
    }
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale }}>
      {/* key 变化 → 子树重挂载，所有 t() 调用点刷新 */}
      <Fragment key={locale}>{children}</Fragment>
    </I18nContext.Provider>
  );
}
