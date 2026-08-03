// 应用级状态：svn 探测结果、工作副本列表、当前选中项、状态表数据。
// 用 zustand 保持轻量，异步动作直接调用 api 层。

import { create } from "zustand";
import type { SvnInfo, StatusEntry, WorkingCopy } from "../types";
import * as svnApi from "../api/svn";
import * as configApi from "../api/config";
import type { SvnError } from "../api/svn";

interface AppState {
  // svn 环境
  svnInfo: SvnInfo | null;
  svnError: SvnError | null;
  detecting: boolean;

  // 工作副本
  workingCopies: WorkingCopy[];
  selectedId: string | null;

  // 当前选中工作副本的状态表
  statusEntries: StatusEntry[];
  statusLoading: boolean;
  statusError: SvnError | null;

  // 状态表中选中的文件（驱动下部差异面板）
  selectedFile: StatusEntry | null;
  selectFile: (entry: StatusEntry | null) => void;

  // 每次 refreshStatus 递增，供 DiffView 等订阅以强制重载当前文件差异
  statusVersion: number;

  // 动作
  detectSvn: () => Promise<void>;
  loadWorkingCopies: () => Promise<void>;
  addWorkingCopy: (path: string) => Promise<void>;
  removeWorkingCopy: (id: string) => Promise<void>;
  reorderWorkingCopies: (ids: string[]) => Promise<void>;
  selectWorkingCopy: (id: string | null) => void;
  refreshStatus: () => Promise<void>;
  updateSelected: () => Promise<number | null>;
}

export const useAppStore = create<AppState>((set, get) => ({
  svnInfo: null,
  svnError: null,
  detecting: false,

  workingCopies: [],
  selectedId: null,

  statusEntries: [],
  statusLoading: false,
  statusError: null,

  selectedFile: null,
  statusVersion: 0,

  selectFile(entry) {
    set({ selectedFile: entry });
  },

  async detectSvn() {
    set({ detecting: true, svnError: null });
    try {
      const info = await svnApi.detectSvn();
      set({ svnInfo: info, detecting: false });
    } catch (e) {
      set({ svnError: e as SvnError, svnInfo: null, detecting: false });
    }
  },

  async loadWorkingCopies() {
    const list = await configApi.listWorkingCopies();
    set({ workingCopies: list });
    // 若当前选中项已不存在，清空选中
    const { selectedId } = get();
    if (selectedId && !list.some((w) => w.id === selectedId)) {
      set({ selectedId: null, statusEntries: [] });
    }
  },

  async addWorkingCopy(path: string) {
    const list = await configApi.addWorkingCopy(path);
    set({ workingCopies: list });
    // 自动选中新添加的（路径匹配）
    const added = list.find((w) => w.path === path);
    if (added) {
      get().selectWorkingCopy(added.id);
    }
  },

  async removeWorkingCopy(id: string) {
    const list = await configApi.removeWorkingCopy(id);
    set({ workingCopies: list });
    if (get().selectedId === id) {
      set({ selectedId: null, statusEntries: [] });
    }
  },

  async reorderWorkingCopies(ids: string[]) {
    // 乐观更新：先按新顺序重排本地列表再持久化，失败则回读磁盘配置
    const { workingCopies } = get();
    const byId = new Map(workingCopies.map((w) => [w.id, w]));
    const next = ids
      .map((id) => byId.get(id))
      .filter((w): w is WorkingCopy => w != null);
    for (const w of workingCopies) {
      if (!ids.includes(w.id)) next.push(w);
    }
    set({ workingCopies: next });
    try {
      const list = await configApi.reorderWorkingCopies(ids);
      set({ workingCopies: list });
    } catch {
      await get().loadWorkingCopies();
    }
  },

  selectWorkingCopy(id: string | null) {
    set({ selectedId: id, statusEntries: [], statusError: null, selectedFile: null });
    const wc = get().workingCopies.find((w) => w.id === id);
    if (id && wc) {
      void get().refreshStatus();
      // 启动对该工作副本的文件监控（自动替换上一个）
      void svnApi.watchWorkingCopy(wc.path).catch(() => {});
    } else {
      void svnApi.unwatchWorkingCopy().catch(() => {});
    }
  },

  async refreshStatus() {
    const { selectedId, workingCopies } = get();
    const wc = workingCopies.find((w) => w.id === selectedId);
    if (!wc) return;
    set({ statusLoading: true, statusError: null });
    try {
      const entries = await svnApi.getStatus(wc.path);
      // 刷新后若原选中文件已不在列表中，同步取消选中
      const { selectedFile } = get();
      const stillThere = selectedFile
        ? entries.find((e) => e.path === selectedFile.path) ?? null
        : null;
      set((s) => ({
        statusEntries: entries,
        statusLoading: false,
        selectedFile: stillThere,
        statusVersion: s.statusVersion + 1,
      }));
    } catch (e) {
      set({ statusError: e as SvnError, statusLoading: false });
    }
  },

  async updateSelected() {
    const { selectedId, workingCopies } = get();
    const wc = workingCopies.find((w) => w.id === selectedId);
    if (!wc) return null;
    const rev = await svnApi.updateWorkingCopy(wc.path);
    await get().refreshStatus();
    return rev;
  },
}));
