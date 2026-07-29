// 全局快捷键：在输入框/文本域内不拦截，避免妨碍打字。
// meta = ⌘（macOS）/ Ctrl（其它平台，用 e.metaKey || e.ctrlKey 兼容）。

import { useEffect } from "react";

export type HotkeyHandlers = {
  /** ⌘R 刷新 status */
  onRefresh?: () => void;
  /** ⌘U 更新工作副本 */
  onUpdate?: () => void;
  /** ⌘↩ 打开提交对话框 */
  onCommit?: () => void;
  /** ⌘L 打开日志 */
  onLog?: () => void;
  /** ⌘B 打开分支/标签 */
  onBranch?: () => void;
  /** ⌘P 打开属性面板 */
  onProperty?: () => void;
  /** Esc 关闭当前对话框（由调用方按 open 状态决定） */
  onEscape?: () => void;
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  // antd 输入框内部可能是 div[role=textbox]
  if (el.closest("[contenteditable=true], .ant-input, .ant-input-affix-wrapper, textarea, input")) return true;
  return false;
}

/** 在组件挂载期间注册全局 keydown；handlers 变化时重绑。 */
export function useHotkeys(handlers: HotkeyHandlers, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      // 输入中：只放行 Esc
      if (isTypingTarget(e.target) && e.key !== "Escape") return;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (e.key === "Escape") {
        handlers.onEscape?.();
        return;
      }

      if (!mod) return;

      if (key === "r" && !e.shiftKey) {
        e.preventDefault();
        handlers.onRefresh?.();
      } else if (key === "u" && !e.shiftKey) {
        e.preventDefault();
        handlers.onUpdate?.();
      } else if (key === "enter" && !e.shiftKey) {
        e.preventDefault();
        handlers.onCommit?.();
      } else if (key === "l" && !e.shiftKey) {
        e.preventDefault();
        handlers.onLog?.();
      } else if (key === "b" && !e.shiftKey) {
        e.preventDefault();
        handlers.onBranch?.();
      } else if (key === "p" && !e.shiftKey) {
        e.preventDefault();
        handlers.onProperty?.();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers, enabled]);
}
