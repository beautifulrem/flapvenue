import type { Graduation } from "@/lib/data/types";
import { ago, shortAddr } from "@/lib/format";
import { formatPercent } from "@/lib/data/decay";
import { getDict, type Lang } from "@/lib/i18n";

export function GraduationsPanel({ graduations, now, lang }: { graduations: Graduation[]; now: number; lang: Lang }) {
  const t = getDict(lang).dash;
  return (
    <div className="hairline rounded-xl bg-surface/60 p-5">
      <h3 className="kicker">{t.gradTitle}</h3>
      <ul className="mt-4 divide-y divide-line">
        {graduations.map((g) => (
          <li key={g.id} className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-accentdim font-mono text-xs font-bold text-accent">
                {g.symbol.slice(0, 2)}
              </span>
              <div>
                <p className="font-display text-sm font-semibold text-fg">{g.symbol}</p>
                <p className="font-mono text-xs text-faint">{t.by} {shortAddr(g.creator)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-xs text-decay">{t.start} {formatPercent(g.startTaxBps, 0)}</p>
              <p className="font-mono text-[0.65rem] text-faint">
                {lang === "zh" ? `${ago(g.ts, now)}${t.ago} · DEX ✓` : `${ago(g.ts, now)} ${t.ago} · DEX ✓`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
