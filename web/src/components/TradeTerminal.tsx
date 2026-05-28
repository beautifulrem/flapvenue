"use client";

import { useEffect, useRef, useState } from "react";
import { genBook, pctChange, type OrderBook as Book } from "@/lib/feed";
import { getDict, type Lang } from "@/lib/i18n";
import { Ticker } from "./Ticker";
import { PriceChart } from "./PriceChart";
import { OrderBook } from "./OrderBook";
import { PnLChart } from "./PnLChart";

export function TradeTerminal({
  symbol,
  quote,
  lang,
  startPrice = 0.0042,
}: {
  symbol: string;
  quote: string;
  lang: Lang;
  startPrice?: number;
}) {
  const t = getDict(lang).terminal;
  const [last, setLast] = useState(startPrice);
  const [book, setBook] = useState<Book>(() => genBook(startPrice));
  const [live, setLive] = useState(false);
  const open24 = useRef(startPrice * 0.963); // ~+3.8% day to start
  const hi = useRef(startPrice * 1.021);
  const lo = useRef(startPrice * 0.955);
  const [, force] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setLive(false);
      return; // static snapshot — respect reduced-motion (no flashing/auto-updates)
    }
    setLive(true);
    let price = startPrice;
    const id = setInterval(() => {
      price = Math.max(startPrice * 0.5, price * (1 + (Math.random() - 0.5) * 0.008));
      hi.current = Math.max(hi.current, price);
      lo.current = Math.min(lo.current, price);
      setLast(price);
      setBook(genBook(price));
      force((n) => n + 1);
    }, 1200);
    return () => clearInterval(id);
  }, [startPrice]);

  const changePct = pctChange(last, open24.current);
  const vol = 920_000 + (hi.current - lo.current) * 4_000_000;

  return (
    <section id="terminal" className="mx-auto w-full max-w-6xl px-6 pt-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold tracking-tight text-fg">{t.title}</h2>
        <span className="rounded-full bg-decaydim px-2.5 py-1 font-mono text-[0.65rem] text-decay">{t.demoBadge}</span>
      </div>
      <div className="rise" style={{ animationDelay: "0ms" }}>
        <Ticker
          symbol={symbol}
          quote={quote}
          last={last}
          changePct={changePct}
          high={hi.current}
          low={lo.current}
          volUsd={vol}
          live={live}
          lang={lang}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px] lg:h-[460px]">
        <PriceChart symbol={symbol} quote={quote} livePrice={last} lang={lang} />
        <OrderBook book={book} last={last} lang={lang} />
      </div>

      <div className="mt-3">
        <PnLChart lang={lang} />
      </div>
    </section>
  );
}
