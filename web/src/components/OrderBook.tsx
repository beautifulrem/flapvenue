"use client";

import type { OrderBook as Book } from "@/lib/feed";
import { getDict, type Lang } from "@/lib/i18n";

// Standard exchange orderbook: asks (sell) red on top, bids (buy) green on bottom, spread in the middle.
// Side color (red ask / green bid) is independent of the price up/down convention.
export function OrderBook({ book, last, lang }: { book: Book; last: number; lang: Lang }) {
  const t = getDict(lang).terminal;
  const max = Math.max(
    book.asks[book.asks.length - 1]?.total ?? 1,
    book.bids[book.bids.length - 1]?.total ?? 1,
  );
  const asks = [...book.asks].reverse(); // best ask nearest the spread (bottom of the ask block)

  return (
    <div className="hairline flex h-full flex-col rounded-xl bg-surface/60 p-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="kicker">{t.book}</h3>
        <span className="font-mono text-[0.65rem] text-faint">{t.sizeTotal}</span>
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-3 px-1 font-mono text-[0.62rem] uppercase tracking-wider text-faint">
        <span>{t.price}</span>
        <span className="text-right">{t.size}</span>
        <span className="text-right">{t.total}</span>
      </div>

      <div className="mt-1 flex-1 space-y-px overflow-hidden" role="table" aria-label="Sell orders">
        {asks.map((r, i) => (
          <Row key={`a${i}`} side="ask" r={r} max={max} />
        ))}
      </div>

      <div className="my-2 flex items-baseline justify-between border-y border-line py-2 px-1">
        <span className="font-mono text-lg font-bold tabular-nums text-fg">{last.toFixed(5)}</span>
        <span className="font-mono text-[0.7rem] text-muted">
          {t.spread} {book.spread.toFixed(5)} <span className="text-faint">({book.spreadPct.toFixed(2)}%)</span>
        </span>
      </div>

      <div className="flex-1 space-y-px overflow-hidden" role="table" aria-label="Buy orders">
        {book.bids.map((r, i) => (
          <Row key={`b${i}`} side="bid" r={r} max={max} />
        ))}
      </div>
    </div>
  );
}

function Row({ side, r, max }: { side: "ask" | "bid"; r: { price: number; size: number; total: number }; max: number }) {
  const pct = Math.min(100, (r.total / max) * 100);
  const isAsk = side === "ask";
  return (
    <div className="relative grid grid-cols-[1fr_auto_auto] gap-x-3 px-1 font-mono text-[0.72rem]">
      <span
        className={`absolute inset-y-0 right-0 ${isAsk ? "bg-up/10" : "bg-down/10"}`}
        style={{ width: `${pct}%` }}
        aria-hidden
      />
      <span className={`relative z-10 tabular-nums ${isAsk ? "text-up" : "text-down"}`}>{r.price.toFixed(5)}</span>
      <span className="relative z-10 text-right tabular-nums text-muted">{r.size.toLocaleString()}</span>
      <span className="relative z-10 text-right tabular-nums text-faint">{r.total.toLocaleString()}</span>
    </div>
  );
}
