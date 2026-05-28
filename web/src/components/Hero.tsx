import { data, nowSec } from "@/lib/data";
import { currentTaxBps, formatPercent } from "@/lib/data/decay";
import { getDict, interp, type Lang } from "@/lib/i18n";
import { DecayCurve } from "./DecayCurve";

export async function Hero({ lang }: { lang: Lang }) {
  const t = getDict(lang).hero;
  const meta = await data.getPoolMeta();
  const now = nowSec();
  const elapsed = now - meta.migrationTs;
  const nowBps = currentTaxBps(meta.startTaxBps, meta.migrationTs, now, meta.decayWindowSec);
  const dayN = Math.max(0, Math.floor(elapsed / 86_400));
  const windowDays = Math.round(meta.decayWindowSec / 86_400);

  return (
    <section className="relative mx-auto w-full max-w-6xl px-6 pt-10 pb-20 sm:pt-16">
      <p className="kicker rise" style={{ animationDelay: "0ms" }}>
        {interp(t.kicker, { chain: meta.chainId })}
      </p>

      <div className="mt-6 grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <h1
            className="rise font-display text-[clamp(2.4rem,6.5vw,5.4rem)] font-extrabold leading-[0.98] tracking-[-0.03em]"
            style={{ animationDelay: "60ms" }}
          >
            {t.h1a}
            <br />
            {t.h1b} <span className="text-muted">{t.h1c}</span>
            <br />
            <span className="text-accent">{t.h1d}</span>
          </h1>

          <p
            className="rise mt-7 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
            style={{ animationDelay: "140ms" }}
          >
            {interp(t.para, { days: windowDays })}
          </p>

          <div className="rise mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: "220ms" }}>
            <a
              href="#dashboard"
              className="glow-accent rounded-md bg-accent px-5 py-3 text-sm font-semibold text-bg transition-transform hover:-translate-y-0.5"
            >
              {t.launch}
            </a>
            <a
              href="#swap"
              className="hairline rounded-md px-5 py-3 text-sm font-semibold text-fg transition-colors hover:border-accent hover:text-accent"
            >
              {t.trySwap}
            </a>
            <span className="kicker ml-1 text-faint">{t.badge}</span>
          </div>

          <dl
            className="rise mt-12 grid max-w-xl grid-cols-3 divide-x divide-line border-y border-line"
            style={{ animationDelay: "300ms" }}
          >
            <Stat label={t.statWindow} value={`${windowDays}${lang === "zh" ? " 天" : " days"}`} />
            <Stat label={t.statRange} value="10% → 0%" />
            <Stat label={t.statGate} value="status == DEX" />
          </dl>
        </div>

        <div className="rise" style={{ animationDelay: "200ms" }}>
          <figure className="hairline relative overflow-hidden rounded-xl bg-surface/70 p-5 backdrop-blur">
            <div className="flex items-baseline justify-between">
              <figcaption className="kicker">{t.cardTitle}</figcaption>
              <span className="font-mono text-xs text-muted">
                {lang === "zh" ? `第 ${dayN}/${windowDays} 天` : `day ${dayN}/${windowDays}`}
              </span>
            </div>

            <div className="mt-2 flex items-end gap-3">
              <span className="font-mono text-4xl font-bold tracking-tight text-decay tabular-nums">
                {formatPercent(nowBps)}
              </span>
              <span className="mb-1 font-mono text-xs text-faint">
                {meta.flapSymbol}/{meta.quoteSymbol}
              </span>
            </div>

            <DecayCurve startBps={meta.startTaxBps} windowSec={meta.decayWindowSec} elapsedSec={elapsed} className="mt-3 w-full" />

            <span className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-accent/50" />
            <span className="pointer-events-none absolute right-2 top-2 h-3 w-3 border-r border-t border-accent/50" />
            <span className="pointer-events-none absolute bottom-2 left-2 h-3 w-3 border-b border-l border-accent/50" />
            <span className="pointer-events-none absolute bottom-2 right-2 h-3 w-3 border-b border-r border-accent/50" />
          </figure>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-4 first:pl-0">
      <dt className="kicker">{label}</dt>
      <dd className="mt-1 font-mono text-xs text-fg sm:text-sm">{value}</dd>
    </div>
  );
}
