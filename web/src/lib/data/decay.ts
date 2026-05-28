// Linear tax decay, a faithful TS mirror of FlapVenue.sol `_currentTaxBps`:
//   taxBps(t) = startBps * (WINDOW - elapsed) / WINDOW, clamped to [0, startBps], 0 once elapsed >= WINDOW.
// Kept in lockstep with the contract so the dashboard curve matches on-chain behavior exactly.

export function currentTaxBps(startBps: number, migrationTs: number, nowSec: number, windowSec: number): number {
  const elapsed = nowSec - migrationTs;
  if (elapsed <= 0) return startBps;
  if (elapsed >= windowSec) return 0;
  return Math.floor((startBps * (windowSec - elapsed)) / windowSec);
}

/** Fraction of the decay window elapsed, clamped to [0, 1]. */
export function decayProgress(migrationTs: number, nowSec: number, windowSec: number): number {
  if (windowSec <= 0) return 1;
  const p = (nowSec - migrationTs) / windowSec;
  return Math.min(1, Math.max(0, p));
}

/** Sampled (dayOffset, bps) points across the full window, for plotting the decay curve. */
export function decaySeries(startBps: number, windowSec: number, points = 60): { t: number; bps: number }[] {
  const out: { t: number; bps: number }[] = [];
  for (let i = 0; i <= points; i++) {
    const elapsed = (windowSec * i) / points;
    out.push({ t: elapsed, bps: currentTaxBps(startBps, 0, elapsed, windowSec) });
  }
  return out;
}

export function bpsToPercent(bps: number): number {
  return bps / 100;
}

export function formatPercent(bps: number, dp = 2): string {
  return `${bpsToPercent(bps).toFixed(dp)}%`;
}
