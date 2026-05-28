import type { Commission } from "@/lib/data/types";
import { fmtNum } from "@/lib/format";
import { getDict, type Lang } from "@/lib/i18n";

export function CommissionCard({ commissions, lang }: { commissions: Commission[]; lang: Lang }) {
  const t = getDict(lang).dash;
  return (
    <div className="hairline rounded-xl bg-surface/60 p-5">
      <h3 className="kicker">{t.commissionTitle}</h3>
      <div className="mt-4 space-y-4">
        {commissions.map((c) => {
          const creatorPct = c.totalSkimmed > 0 ? (c.creatorAccrued / c.totalSkimmed) * 100 : 0;
          return (
            <div key={c.symbol}>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-sm text-fg">{c.symbol}</span>
                <span className="font-mono text-xs text-faint">
                  {fmtNum(c.totalSkimmed, c.totalSkimmed < 1000 ? 2 : 0)} {t.skimmed}
                </span>
              </div>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface2">
                <span className="h-full bg-accent" style={{ width: `${creatorPct}%` }} />
                <span className="h-full bg-decay" style={{ width: `${100 - creatorPct}%` }} />
              </div>
              <div className="mt-2 flex justify-between font-mono text-xs">
                <span className="text-accent">
                  {t.creator} {fmtNum(c.creatorAccrued, c.creatorAccrued < 1000 ? 2 : 0)}
                </span>
                <span className="text-decay">
                  {t.protocol} {fmtNum(c.protocolAccrued, c.protocolAccrued < 1000 ? 2 : 0)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
