"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { currentTaxBps, formatPercent } from "@/lib/data/decay";
import { fmtNum } from "@/lib/format";
import { getDict, interp, type Lang } from "@/lib/i18n";

type Props = {
  startBps: number;
  migrationTs: number;
  windowSec: number;
  now: number;
  flapSymbol: string;
  quoteSymbol: string;
  lang: Lang;
};

export function SwapPanel(p: Props) {
  const t = getDict(p.lang).swap;
  const { isConnected } = useAccount();
  const [amount, setAmount] = useState("100");
  const [buy, setBuy] = useState(true); // buy = quote -> flap (tax taken on quote input)
  const [submitted, setSubmitted] = useState(false);

  const bps = currentTaxBps(p.startBps, p.migrationTs, p.now, p.windowSec);
  const amt = Number(amount) || 0;
  const tax = (amt * bps) / 10_000;
  const swapped = amt - tax;
  const inSym = buy ? p.quoteSymbol : p.flapSymbol;
  const outSym = buy ? p.flapSymbol : p.quoteSymbol;

  return (
    <div className="hairline rounded-xl bg-surface/60 p-5">
      <div className="flex items-center justify-between">
        <h3 className="kicker">{t.panelTitle}</h3>
        <span className="rounded-full bg-decaydim px-2 py-1 font-mono text-[0.65rem] text-decay">
          {p.lang === "zh" ? "税 " : "tax "}{formatPercent(bps)}
        </span>
      </div>

      {/* direction */}
      <div className="mt-4 grid grid-cols-2 gap-1 rounded-md bg-surface2 p-1 font-mono text-xs">
        <button
          type="button"
          onClick={() => setBuy(true)}
          className={`cursor-pointer rounded px-3 py-1.5 transition-colors ${buy ? "bg-accent text-bg" : "text-muted hover:text-fg"}`}
        >
          {t.buy} {p.flapSymbol}
        </button>
        <button
          type="button"
          onClick={() => setBuy(false)}
          className={`cursor-pointer rounded px-3 py-1.5 transition-colors ${!buy ? "bg-accent text-bg" : "text-muted hover:text-fg"}`}
        >
          {t.sell} {p.flapSymbol}
        </button>
      </div>

      {/* input */}
      <label className="mt-4 block">
        <span className="kicker">{t.youPay}</span>
        <div className="mt-1 flex items-center gap-2 rounded-md border border-line bg-bg px-3 py-3">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^0-9.]/g, ""));
              setSubmitted(false);
            }}
            className="w-full bg-transparent font-mono text-xl text-fg outline-none"
            placeholder="0.0"
          />
          <span className="font-mono text-sm text-faint">{inSym}</span>
        </div>
      </label>

      {/* breakdown */}
      <dl className="mt-4 space-y-2 font-mono text-xs">
        <Row label={t.rowTax} value={`− ${fmtNum(tax, 4)} ${inSym}`} accent="decay" />
        <Row label={t.rowInto} value={`${fmtNum(swapped, 4)} ${inSym}`} />
        <Row label={interp(t.rowOut, { sym: outSym })} value={`≈ ${fmtNum(swapped, 4)}`} accent="accent" />
      </dl>

      {/* action */}
      <button
        type="button"
        disabled={!isConnected || amt <= 0}
        onClick={() => setSubmitted(true)}
        className="mt-5 w-full cursor-pointer rounded-md bg-accent py-3 font-mono text-sm font-semibold text-bg transition-transform enabled:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {!isConnected ? t.connectToSwap : submitted ? t.recorded : t.swap}
      </button>

      {submitted && isConnected && (
        <p className="mt-3 text-center font-mono text-[0.65rem] text-muted">
          {t.demoNote}
        </p>
      )}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: "accent" | "decay" }) {
  const color = accent === "decay" ? "text-decay" : accent === "accent" ? "text-accent" : "text-fg";
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={color}>{value}</dd>
    </div>
  );
}
