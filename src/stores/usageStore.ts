import { create } from 'zustand';
import { bridge, type BalanceResult, type UsageTotals } from '../lib/tauri-bridge';

/**
 * Usage panel store — holds the 5h rolling-window aggregates (read from the
 * append-only ~/.tokenicode/usage-log.jsonl via Rust) and the latest Qwen BSS
 * balance probe. The panel calls refresh() on mount and on a timer; balance
 * refresh needs an apiKey (loaded from vision-credentials by the panel).
 */
interface UsageState {
  balance: BalanceResult | null;
  totals: UsageTotals | null;
  entries: Record<string, unknown>[];
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;

  /** Re-read the 5h usage window from the backend log. */
  refresh: () => Promise<void>;
  /** Probe the Aliyun BSS balance endpoint (best-effort, may return null). */
  refreshBalance: () => Promise<void>;
}

export const useUsageStore = create<UsageState>((set) => ({
  balance: null,
  totals: null,
  entries: [],
  loading: false,
  error: null,
  lastUpdated: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const r = await bridge.readUsageLog(18000); // 5h
      set({
        totals: r.totals,
        entries: r.entries,
        loading: false,
        lastUpdated: Date.now(),
      });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  refreshBalance: async () => {
    try {
      const b = await bridge.queryQwenBalance();
      set({ balance: b });
    } catch (e) {
      set({
        balance: {
          balance: null,
          updateTime: Math.floor(Date.now() / 1000),
          error: String(e),
        },
      });
    }
  },
}));
