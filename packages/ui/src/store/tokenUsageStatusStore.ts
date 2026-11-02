import { create } from "zustand";
import type { TokenUsageWindowSnapshot } from "@zcode/shared";

/**
 * 个人定制：token 用量状态条的数据源（主进程 pump 经 IPC 推送的最新快照）。
 * 快照含本窗口全部可见会话，状态条按自身 sessionId 选取；无平台实现（web）时保持 null 不渲染。
 */
interface TokenUsageStatusState {
  snapshot: TokenUsageWindowSnapshot | null;
  setSnapshot: (snapshot: TokenUsageWindowSnapshot) => void;
  clear: () => void;
}

export const useTokenUsageStatusStore = create<TokenUsageStatusState>((set) => ({
  snapshot: null,
  setSnapshot: (snapshot) => set({ snapshot }),
  clear: () => set({ snapshot: null }),
}));
