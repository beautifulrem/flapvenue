export function shortAddr(a: string, n = 4): string {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 2 + n)}…${a.slice(-n)}`;
}

export function fmtNum(n: number, max = 2): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: max }).format(n);
}

export function fmtCompact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

export function fmtUsd(n: number): string {
  return `$${fmtCompact(n)}`;
}

/** Compact relative-time vs a reference clock (deterministic for the mock source). */
export function ago(tsSec: number, nowSec: number): string {
  const d = Math.max(0, nowSec - tsSec);
  if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86_400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86_400)}d`;
}
