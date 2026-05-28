import type { DataSource } from "./types";
import { mockSource, MOCK_NOW } from "./mock";
import { liveSource } from "./live";

const useLive = process.env.NEXT_PUBLIC_DATA_SOURCE === "live";

// When live, fall back to mock per call if a testnet read fails, so the deployed app never breaks.
function withMockFallback(primary: DataSource): DataSource {
  const wrap =
    <K extends keyof DataSource>(key: K): DataSource[K] =>
    (async (...args: unknown[]) => {
      try {
        return await (primary[key] as (...a: unknown[]) => Promise<unknown>)(...args);
      } catch (err) {
        console.warn(`[data] live ${String(key)} failed; using mock`, err);
        return (mockSource[key] as (...a: unknown[]) => Promise<unknown>)(...args);
      }
    }) as DataSource[K];
  return {
    getPoolMeta: wrap("getPoolMeta"),
    getCommissions: wrap("getCommissions"),
    getSkims: wrap("getSkims"),
    getGraduations: wrap("getGraduations"),
    getPoolStats: wrap("getPoolStats"),
  };
}

/** Active data source. `mock` by default; `live` (viem reads w/ mock fallback) when NEXT_PUBLIC_DATA_SOURCE=live. */
export const data: DataSource = useLive ? withMockFallback(liveSource) : mockSource;

/** Reference clock for the active source (deterministic for mock; Date.now()-based for live). */
export const nowSec = (): number => (useLive ? Math.floor(Date.now() / 1000) : MOCK_NOW);

export * from "./types";
