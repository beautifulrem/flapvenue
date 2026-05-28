import type { Address, Commission, DataSource, Graduation, PoolMeta, PoolStats, TaxSkim } from "./types";

// Deterministic reference clock so the UI (and snapshot tests) render identically every time.
// Pool migrated 9 days into a 30-day decay window → ~70% of the creator tax remains.
export const MOCK_NOW = 1_900_000_000;
const DAY = 86_400;
const WINDOW = 30 * DAY;
const MIGRATION = MOCK_NOW - 9 * DAY;

const CREATOR: Address = "0xC0FFEE0000000000000000000000000000C0FFEE";

const addr = (n: number): Address =>
  ("0x" + n.toString(16).padStart(40, "0")) as Address;
const hash = (n: number): Address =>
  ("0x" + (n * 7919).toString(16).padStart(64, "0").slice(0, 64)) as Address;

const POOL_META: PoolMeta = {
  poolId: "0x9af1...e3d0",
  flapSymbol: "FLAPMEME",
  quoteSymbol: "USDT0",
  creator: CREATOR,
  migrationTs: MIGRATION,
  startTaxBps: 1000,
  decayWindowSec: WINDOW,
  chainId: 1952,
};

// A descending tax-bps reflecting the decay, with a mix of buys (USDT0 in) and sells (FLAPMEME in).
const SKIMS: TaxSkim[] = Array.from({ length: 14 }).map((_, i) => {
  const ts = MOCK_NOW - i * 1180;
  const buy = i % 2 === 0;
  const taxBps = 712 - i * 3;
  return {
    id: `skim-${i}`,
    ts,
    swapper: addr(0xa11ce + i * 0x131),
    taxBps,
    taxAmount: buy ? 12.4 + (i % 5) * 3.1 : 84_000 + (i % 6) * 5400,
    symbol: buy ? "USDT0" : "FLAPMEME",
    txHash: hash(i + 1),
  };
});

const GRADUATIONS: Graduation[] = [
  {
    id: "grad-0",
    ts: MIGRATION,
    token: addr(0xf1a9),
    symbol: "FLAPMEME",
    creator: CREATOR,
    startTaxBps: 1000,
    pool: addr(0x9af1e3d0),
  },
  {
    id: "grad-1",
    ts: MIGRATION - 3 * DAY,
    token: addr(0x6909),
    symbol: "OKBDOG",
    creator: addr(0xbeef11),
    startTaxBps: 800,
    pool: addr(0x6909aa01),
  },
  {
    id: "grad-2",
    ts: MIGRATION - 11 * DAY,
    token: addr(0x1c0a),
    symbol: "XLAYR",
    creator: addr(0xcafe22),
    startTaxBps: 600,
    pool: addr(0x1c0a7777),
  },
];

const COMMISSIONS: Commission[] = [
  { symbol: "USDT0", creatorAccrued: 1_284.62, protocolAccrued: 142.74, totalSkimmed: 1_427.36 },
  { symbol: "FLAPMEME", creatorAccrued: 5_940_000, protocolAccrued: 660_000, totalSkimmed: 6_600_000 },
];

const STATS: PoolStats = {
  priceUsd: 0.00412,
  tvlUsd: 184_300,
  volume24hUsd: 92_750,
  swaps24h: 318,
};

const wait = <T>(v: T): Promise<T> => Promise.resolve(v);

export const mockSource: DataSource = {
  getPoolMeta: () => wait(POOL_META),
  getCommissions: () => wait(COMMISSIONS),
  getSkims: (limit = 14) => wait(SKIMS.slice(0, limit)),
  getGraduations: () => wait(GRADUATIONS),
  getPoolStats: () => wait(STATS),
};
