import { data, nowSec } from "@/lib/data";
import { getDict, type Lang } from "@/lib/i18n";
import { SwapPanel } from "./SwapPanel";

export async function SwapSection({ lang }: { lang: Lang }) {
  const t = getDict(lang).swap;
  const meta = await data.getPoolMeta();
  const now = nowSec();

  return (
    <section id="swap" className="mx-auto w-full max-w-6xl px-6 py-20">
      <header>
        <p className="kicker">{t.kicker}</p>
        <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{t.heading}</h2>
      </header>

      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[1fr_0.9fr]">
        <div>
          <ol className="space-y-5">
            {t.steps.map((text, i) => (
              <li key={i} className="flex gap-4">
                <span className="font-mono text-sm text-accent">{String(i + 1).padStart(2, "0")}</span>
                <p className="max-w-md text-sm leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 max-w-md border-l-2 border-decay/50 pl-4 font-mono text-xs leading-relaxed text-faint">
            {t.note}
          </p>
        </div>

        <SwapPanel
          startBps={meta.startTaxBps}
          migrationTs={meta.migrationTs}
          windowSec={meta.decayWindowSec}
          now={now}
          flapSymbol={meta.flapSymbol}
          quoteSymbol={meta.quoteSymbol}
          lang={lang}
        />
      </div>
    </section>
  );
}
