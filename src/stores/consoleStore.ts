// 输出控制台状态：订阅后端 svn-console 事件，滚动保留最近 500 条。

import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ConsoleLine } from "../types";

const MAX_LINES = 500;

interface ConsoleState {
  lines: ConsoleLine[];
  append: (line: ConsoleLine) => void;
  clear: () => void;
}

export const useConsoleStore = create<ConsoleState>((set) => ({
  lines: [],
  append: (line) =>
    set((s) => ({
      lines: [...s.lines.slice(-(MAX_LINES - 1)), line],
    })),
  clear: () => set({ lines: [] }),
}));

/** 订阅后端控制台事件；返回取消订阅函数（App 卸载时调用）。 */
export function subscribeConsole(): Promise<UnlistenFn> {
  return listen<ConsoleLine>("svn-console", (event) => {
    useConsoleStore.getState().append(event.payload);
  });
}
