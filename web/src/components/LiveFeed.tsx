import type { TaxSkim } from "@/lib/data/types";
import { ago, fmtNum, shortAddr } from "@/lib/format";
import { formatPercent } from "@/lib/data/decay";
import { getDict, type Lang } from "@/lib/i18n";

export function LiveFeed({ skims, now, lang }: { skims: TaxSkim[]; now: number; lang: Lang }) {
  const t = getDict(lang).dash;
  return (
    <div className="hairline rounded-xl bg-surface/60 p-5">
      <div className="flex items-center justify-between">
        <h3 className="kicker">{t.feedTitle}</h3>
        <span className="flex items-center gap-2 font-mono text-xs text-muted">
          <span className="blink inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          {getDict(lang).terminal.live}
        </span>
      </div>

      <div className="mt-4 overflow-hidden">
        <div className="grid grid-cols-[3rem_1fr_5rem_auto] gap-x-3 border-b border-line pb-2 font-mono text-[0.65rem] uppercase tracking-wider text-faint">
          <span>{t.age}</span>
          <span>{t.swapper}</span>
          <span className="text-right">{t.tax}</span>
          <span className="text-right">{t.amount}</span>
        </div>
        <ul className="divide-y divide-line">
          {skims.map((s) => (
            <li key={s.id} className="grid grid-cols-[3rem_1fr_5rem_auto] items-center gap-x-3 py-2 font-mono text-xs">
              <span className="text-faint">{ago(s.ts, now)}</span>
              <span className="truncate text-muted">{shortAddr(s.swapper)}</span>
              <span className="text-right text-decay">{formatPercent(s.taxBps)}</span>
              <span className="text-right text-fg">
                {fmtNum(s.taxAmount, s.taxAmount < 1000 ? 2 : 0)} <span className="text-faint">{s.symbol}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
