"use client";

import { getDict, type Lang } from "@/lib/i18n";
import { AnimatedNumber } from "./AnimatedNumber";

type Props = {
  symbol: string;
  quote: string;
  last: number;
  changePct: number;
  high: number;
  low: number;
  volUsd: number;
  live: boolean;
  lang: Lang;
};

export function Ticker({ symbol, quote, last, changePct, high, low, volUsd, live, lang }: Props) {
  const t = getDict(lang).terminal;
  const up = changePct >= 0; // price up → red (OKX 红涨)
  const dir = up ? "text-up" : "text-down";

  return (
    <div className="hairline flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-surface/60 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-accentdim font-mono text-[0.7rem] font-bold text-accent">
          {symbol.slice(0, 2)}
        </span>
        <span className="font-display text-base font-bold text-fg">
          {symbol}<span className="text-faint">/{quote}</span>
        </span>
        <span className="ml-1 flex items-center gap-1.5 rounded-full bg-surface2 px-2 py-0.5 font-mono text-[0.6rem] text-muted">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${live ? "bg-down pulse-dot" : "bg-faint"}`} />
          {live ? t.live : t.paused}
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <AnimatedNumber value={last} decimals={5} flash="price" className={`font-mono text-2xl font-bold ${dir}`} ariaLabel="last price" />
        <AnimatedNumber value={changePct} decimals={2} prefix={up ? "+" : ""} suffix="%" className={`font-mono text-sm font-semibold ${dir}`} ariaLabel="24h change" />
      </div>

      <Stat label={t.high} value={high.toFixed(5)} />
      <Stat label={t.low} value={low.toFixed(5)} />
      <Stat label={t.vol} value={`$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(volUsd)}`} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="hidden flex-col sm:flex">
      <span className="font-mono text-[0.6rem] uppercase tracking-wider text-faint">{label}</span>
      <span className="font-mono text-xs tabular-nums text-fg">{value}</span>
    </div>
  );
}
