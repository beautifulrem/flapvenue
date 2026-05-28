// Synthetic price feed for the trading-terminal demo. The X Layer testnet pool has no OHLC history or
// high-frequency ticks, so the candle/PnL/orderbook visuals run on this client-side simulated feed
// (clearly a demo feed; the real on-chain numbers live in the dashboard panels below).

export type Candle = { time: number; open: number; high: number; low: number; close: number };
export type Timeframe = "1m" | "5m" | "1H" | "1D";

export const TF_SECONDS: Record<Timeframe, number> = { "1m": 60, "5m": 300, "1H": 3600, "1D": 86_400 };

// Small deterministic PRNG so a given seed yields a stable history (avoids re-roll on remount).
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Generate `count` ascending OHLC candles ending at the current interval, random-walking from `start`. */
export function genCandles(count: number, intervalSec: number, start = 0.0042, seed = 7): Candle[] {
  const rnd = mulberry32(seed + intervalSec);
  const now = Math.floor(Date.now() / 1000);
  const t0 = Math.floor(now / intervalSec) * intervalSec - (count - 1) * intervalSec;
  let price = start;
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const open = price;
    const vol = start * 0.018;
    const close = Math.max(start * 0.25, open + (rnd() - 0.485) * vol);
    const high = Math.max(open, close) + rnd() * vol * 0.6;
    const low = Math.min(open, close) - rnd() * vol * 0.6;
    out.push({ time: t0 + i * intervalSec, open: r6(open), high: r6(high), low: r6(low), close: r6(close) });
    price = close;
  }
  return out;
}

/** Advance the forming candle by one tick; roll into a new candle when the interval elapses. */
export function stepCandle(cur: Candle, intervalSec: number): { cur: Candle; rolled: Candle | null } {
  const now = Math.floor(Date.now() / 1000);
  const vol = cur.close * 0.004;
  const next = Math.max(cur.close * 0.5, cur.close + (Math.random() - 0.5) * vol);
  const bucket = Math.floor(now / intervalSec) * intervalSec;
  if (bucket > cur.time) {
    const rolled = cur;
    return { cur: { time: bucket, open: r6(cur.close), high: r6(Math.max(cur.close, next)), low: r6(Math.min(cur.close, next)), close: r6(next) }, rolled };
  }
  return {
    cur: { ...cur, close: r6(next), high: r6(Math.max(cur.high, next)), low: r6(Math.min(cur.low, next)) },
    rolled: null,
  };
}

export type BookRow = { price: number; size: number; total: number };
export type OrderBook = { bids: BookRow[]; asks: BookRow[]; spread: number; spreadPct: number };

/** Build a synthetic order book around `mid`. */
export function genBook(mid: number, rows = 9, seed = 1): OrderBook {
  const rnd = mulberry32(Math.floor(mid * 1e6) + seed);
  const step = mid * 0.0008;
  const mk = (sign: 1 | -1): BookRow[] => {
    let total = 0;
    return Array.from({ length: rows }).map((_, i) => {
      const price = r6(mid + sign * step * (i + 1));
      const size = Math.round((rnd() * 4000 + 600) * (1 + i * 0.12));
      total += size;
      return { price, size, total };
    });
  };
  const asks = mk(1);
  const bids = mk(-1);
  const spread = r6((asks[0]?.price ?? mid) - (bids[0]?.price ?? mid));
  return { bids, asks, spread, spreadPct: r6((spread / mid) * 100) };
}

export function pctChange(last: number, ref: number): number {
  if (!ref) return 0;
  return ((last - ref) / ref) * 100;
}

/** A cumulative-PnL walk for the demo (positive green / negative red), anchored to 0 at start. */
export function genPnl(points: number, seed = 13): { t: number; pnl: number }[] {
  const rnd = mulberry32(seed);
  // A brief early dip (red, below baseline) then a clear sustained climb into profit (green), a winning
  // demo position that still exercises the green/red split at the zero baseline.
  let pnl = 60;
  const out: { t: number; pnl: number }[] = [];
  for (let i = 0; i < points; i++) {
    const bias = i < points * 0.18 ? -22 : 26;
    pnl += (rnd() - 0.5) * 90 + bias;
    out.push({ t: i, pnl: Math.round(pnl) });
  }
  return out;
}
