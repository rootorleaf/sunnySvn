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

  // 动作
  detectSvn: () => Promise<void>;
  loadWorkingCopies: () => Promise<void>;
  addWorkingCopy: (path: string) => Promise<void>;
  removeWorkingCopy: (id: string) => Promise<void>;
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

  selectWorkingCopy(id: string | null) {
    set({ selectedId: id, statusEntries: [], statusError: null });
    if (id) {
      void get().refreshStatus();
    }
  },

  async refreshStatus() {
    const { selectedId, workingCopies } = get();
    const wc = workingCopies.find((w) => w.id === selectedId);
    if (!wc) return;
    set({ statusLoading: true, statusError: null });
    try {
      const entries = await svnApi.getStatus(wc.path);
      set({ statusEntries: entries, statusLoading: false });
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
