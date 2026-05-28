import { data, nowSec } from "@/lib/data";
import { currentTaxBps, formatPercent } from "@/lib/data/decay";
import { fmtCompact } from "@/lib/format";
import { getDict, interp, type Lang } from "@/lib/i18n";
import { LiveFeed } from "./LiveFeed";
import { CommissionCard } from "./CommissionCard";
import { GraduationsPanel } from "./GraduationsPanel";

export async function Dashboard({ lang }: { lang: Lang }) {
  const t = getDict(lang).dash;
  const [meta, skims, commissions, graduations, stats] = await Promise.all([
    data.getPoolMeta(),
    data.getSkims(),
    data.getCommissions(),
    data.getGraduations(),
    data.getPoolStats(),
  ]);

  const now = nowSec();
  const elapsed = now - meta.migrationTs;
  const nowBps = currentTaxBps(meta.startTaxBps, meta.migrationTs, now, meta.decayWindowSec);
  const day = Math.max(0, Math.floor(elapsed / 86_400));
  const windowDays = Math.round(meta.decayWindowSec / 86_400);

  return (
    <section id="dashboard" className="mx-auto w-full max-w-6xl px-6 py-20">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">{interp(t.kicker, { chain: meta.chainId })}</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{t.heading}</h2>
        </div>
        <p className="max-w-sm font-mono text-xs text-muted">
          {t.sub1}
          <span className="text-fg">HookTaxSkim</span>, <span className="text-fg">CommissionAccrued</span>,{" "}
          <span className="text-fg">HookGraduation</span>
          {t.sub2}
        </p>
      </header>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        <div className="hairline rounded-xl bg-surface/60 p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="kicker">{interp(t.poolTitle, { flap: meta.flapSymbol, quote: meta.quoteSymbol })}</h3>
            <span className="font-mono text-xs text-muted">{interp(t.creatorTaxDay, { d: day, w: windowDays })}</span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tile label={t.curTax} value={formatPercent(nowBps)} accent />
            <Tile label={t.taxSkims} value={fmtCompact(stats.swaps24h)} />
            <Tile label={t.decaysTo} value={`0% · ${lang === "zh" ? `第 ${windowDays} 天` : `day ${windowDays}`}`} />
          </dl>
        </div>

        <CommissionCard commissions={commissions} lang={lang} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <LiveFeed skims={skims} now={now} lang={lang} />
        <GraduationsPanel graduations={graduations} now={now} lang={lang} />
      </div>
    </section>
  );
}

function Tile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="hairline rounded-lg bg-surface2/50 px-3 py-3">
      <dt className="kicker">{label}</dt>
      <dd className={`mt-1 font-mono text-sm tabular-nums ${accent ? "text-decay" : "text-fg"}`}>{value}</dd>
    </div>
  );
}
