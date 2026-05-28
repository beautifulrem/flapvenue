"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  AreaSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { genCandles, TF_SECONDS, type Candle, type Timeframe } from "@/lib/feed";
import { getDict, type Lang } from "@/lib/i18n";

const TFS: Timeframe[] = ["1m", "5m", "1H", "1D"];
const UP = "#f6465d"; // price up = red (OKX 红涨)
const DOWN = "#2ebd85"; // price down = green (绿跌)
const css = (v: string, fb: string) =>
  typeof window === "undefined" ? fb : getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb;

type Props = { symbol: string; quote: string; livePrice: number; lang: Lang };

export function PriceChart({ symbol, quote, livePrice, lang }: Props) {
  const tt = getDict(lang).terminal;
  const wrap = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Area"> | null>(null);
  const candleRef = useRef<Candle[]>([]);
  const curRef = useRef<Candle | null>(null);

  const [tf, setTf] = useState<Timeframe>("5m");
  const [type, setType] = useState<"candles" | "line">("candles");
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<Candle | null>(null);

  // Build (or rebuild) the chart whenever timeframe or type changes.
  useEffect(() => {
    if (!wrap.current) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const chart = createChart(wrap.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: css("--color-muted", "#8b909a"),
        fontFamily: css("--font-mono", "monospace"),
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: css("--color-line", "#1b1e25") },
        horzLines: { color: css("--color-line", "#1b1e25") },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: css("--color-line", "#1b1e25") },
      timeScale: { borderColor: css("--color-line", "#1b1e25"), timeVisible: true, secondsVisible: tf === "1m" },
      handleScale: !reduced,
      handleScroll: !reduced,
    });
    chartRef.current = chart;

    const candles = genCandles(120, TF_SECONDS[tf], livePrice || 0.0042, 7);
    candleRef.current = candles;
    curRef.current = { ...candles[candles.length - 1] };

    if (type === "candles") {
      const s = chart.addSeries(CandlestickSeries, {
        upColor: UP,
        downColor: DOWN,
        wickUpColor: UP,
        wickDownColor: DOWN,
        borderVisible: false,
        priceFormat: { type: "price", precision: 6, minMove: 0.000001 },
      });
      s.setData(candles as never);
      seriesRef.current = s;
    } else {
      const s = chart.addSeries(AreaSeries, {
        lineColor: css("--color-accent", "#b8ff2e"),
        topColor: "rgba(184,255,46,0.25)",
        bottomColor: "rgba(184,255,46,0.01)",
        lineWidth: 2,
        priceFormat: { type: "price", precision: 6, minMove: 0.000001 },
      });
      s.setData(candles.map((c) => ({ time: c.time as Time, value: c.close })) as never);
      seriesRef.current = s;
    }

    chart.timeScale().fitContent();
    setReady(true);

    const onMove = (p: { time?: Time; seriesData: Map<unknown, unknown> }) => {
      const d = seriesRef.current ? (p.seriesData.get(seriesRef.current) as Candle | undefined) : undefined;
      setHover(d ?? null);
    };
    chart.subscribeCrosshairMove(onMove as never);

    return () => {
      chart.unsubscribeCrosshairMove(onMove as never);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tf, type]);

  // Fold the live price into the forming candle (imperative .update, no React re-render of the chart).
  useEffect(() => {
    const s = seriesRef.current;
    const cur = curRef.current;
    if (!s || !cur || !livePrice) return;
    const next: Candle = {
      time: cur.time,
      open: cur.open,
      high: Math.max(cur.high, livePrice),
      low: Math.min(cur.low, livePrice),
      close: livePrice,
    };
    curRef.current = next;
    if (type === "candles") (s as ISeriesApi<"Candlestick">).update(next as never);
    else (s as ISeriesApi<"Area">).update({ time: next.time as Time, value: livePrice } as never);
  }, [livePrice, type]);

  const shown = hover ?? curRef.current ?? candleRef.current[candleRef.current.length - 1];
  const up = shown ? shown.close >= shown.open : true;

  return (
    <div className="hairline relative flex h-full flex-col rounded-xl bg-surface/60 p-3">
      {/* header: symbol + OHLC legend + controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-3">
          <span className="font-display text-sm font-bold text-fg">
            {symbol}<span className="text-faint">/{quote}</span>
          </span>
          {shown && (
            <span className="hidden font-mono text-[0.7rem] text-muted sm:inline">
              O<i className={up ? "text-up" : "text-down"}>{shown.open.toFixed(5)}</i>{" "}
              H<i className={up ? "text-up" : "text-down"}>{shown.high.toFixed(5)}</i>{" "}
              L<i className={up ? "text-up" : "text-down"}>{shown.low.toFixed(5)}</i>{" "}
              C<i className={up ? "text-up" : "text-down"}>{shown.close.toFixed(5)}</i>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Seg active={type === "candles"} onClick={() => setType("candles")}>{tt.candles}</Seg>
          <Seg active={type === "line"} onClick={() => setType("line")}>{tt.line}</Seg>
          <span className="mx-1 h-4 w-px bg-line" />
          {TFS.map((t) => (
            <Seg key={t} active={tf === t} onClick={() => setTf(t)}>{t}</Seg>
          ))}
        </div>
      </div>

      <div className="relative mt-2 flex-1 min-h-[300px]">
        <div ref={wrap} className="absolute inset-0" />
        {!ready && <div className="skeleton absolute inset-0 rounded-lg" aria-hidden />}
      </div>
    </div>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded px-2 py-1 font-mono text-[0.7rem] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60 ${
        active ? "bg-accent/15 text-accent" : "text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
