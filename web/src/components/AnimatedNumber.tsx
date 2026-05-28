"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Flash background on change. "price" = up→red / down→green (OKX 红涨绿跌). "pnl" = up→green / down→red. */
  flash?: "none" | "price" | "pnl";
  className?: string;
  ariaLabel?: string;
};

const fmt = (n: number, d: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function AnimatedNumber({
  value,
  decimals = 2,
  prefix = "",
  suffix = "",
  flash = "none",
  className = "",
  ariaLabel,
}: Props) {
  const [display, setDisplay] = useState(value);
  const [flashCls, setFlashCls] = useState("");
  const prev = useRef(value);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = to;
    if (from === to) return;

    if (prefersReduced()) {
      setDisplay(to);
    } else {
      const start = performance.now();
      const dur = 320;
      const step = (t: number) => {
        const k = Math.min(1, (t - start) / dur);
        const eased = 1 - Math.pow(1 - k, 3); // ease-out
        setDisplay(from + (to - from) * eased);
        if (k < 1) raf.current = requestAnimationFrame(step);
      };
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(step);
    }

    if (flash !== "none") {
      const up = to >= from;
      // price: up→red(flash-up), down→green(flash-down). pnl: up→green(flash-down), down→red(flash-up).
      const cls = flash === "price" ? (up ? "flash-up" : "flash-down") : up ? "flash-down" : "flash-up";
      setFlashCls(cls);
      const id = setTimeout(() => setFlashCls(""), 460);
      return () => clearTimeout(id);
    }
  }, [value, flash]);

  useEffect(() => () => void (raf.current && cancelAnimationFrame(raf.current)), []);

  return (
    <span aria-label={ariaLabel} aria-live="polite" className={`tabular-nums rounded-sm ${flashCls} ${className}`}>
      {prefix}
      {fmt(display, decimals)}
      {suffix}
    </span>
  );
}
