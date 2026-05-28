import { describe, it, expect } from "vitest";
import { currentTaxBps, decayProgress, decaySeries } from "./decay";

const WINDOW = 30 * 24 * 3600;
const START = 1000; // 10%
const MIG = 1_000_000;

describe("currentTaxBps (mirrors FlapVenue.sol _currentTaxBps)", () => {
  it("equals start at t0", () => {
    expect(currentTaxBps(START, MIG, MIG, WINDOW)).toBe(START);
  });

  it("is ~50% at the halfway point", () => {
    const v = currentTaxBps(START, MIG, MIG + WINDOW / 2, WINDOW);
    expect(v).toBeGreaterThanOrEqual(499);
    expect(v).toBeLessThanOrEqual(500);
  });

  it("is 0 exactly at the window end", () => {
    expect(currentTaxBps(START, MIG, MIG + WINDOW, WINDOW)).toBe(0);
  });

  it("is 0 after the window", () => {
    expect(currentTaxBps(START, MIG, MIG + WINDOW + 1, WINDOW)).toBe(0);
  });

  it("never exceeds start before t0", () => {
    expect(currentTaxBps(START, MIG, MIG - 100, WINDOW)).toBe(START);
  });
});

describe("decayProgress", () => {
  it("is 0.5 halfway", () => {
    expect(decayProgress(MIG, MIG + WINDOW / 2, WINDOW)).toBeCloseTo(0.5);
  });
  it("clamps to [0,1]", () => {
    expect(decayProgress(MIG, MIG - 5, WINDOW)).toBe(0);
    expect(decayProgress(MIG, MIG + WINDOW * 2, WINDOW)).toBe(1);
  });
});

describe("decaySeries", () => {
  it("starts at start and ends at zero", () => {
    const s = decaySeries(START, WINDOW, 30);
    expect(s[0].bps).toBe(START);
    expect(s[s.length - 1].bps).toBe(0);
    expect(s).toHaveLength(31);
  });
  it("is monotonically non-increasing", () => {
    const s = decaySeries(START, WINDOW, 40);
    for (let i = 1; i < s.length; i++) expect(s[i].bps).toBeLessThanOrEqual(s[i - 1].bps);
  });
});
