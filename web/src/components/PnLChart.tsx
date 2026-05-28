"use client";

import { useMemo } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { genPnl } from "@/lib/feed";
import { getDict, interp, type Lang } from "@/lib/i18n";

const PROFIT = "#2ebd85";
const LOSS = "#f6465d";

export function PnLChart({ lang }: { lang: Lang }) {
  const t = getDict(lang).terminal;
  const data = useMemo(() => genPnl(60), []);
  const last = data[data.length - 1]?.pnl ?? 0;
  const notional = 25_000;
  const ret = (last / notional) * 100;

  const dataMax = Math.max(...data.map((d) => d.pnl), 0);
  const dataMin = Math.min(...data.map((d) => d.pnl), 0);
  const off = dataMax <= 0 ? 0 : dataMin >= 0 ? 1 : dataMax / (dataMax - dataMin);
  const pos = last >= 0;

  return (
    <div className="hairline flex h-full flex-col rounded-xl bg-surface/60 p-4">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="kicker">{t.pnlTitle}</h3>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`font-mono text-2xl font-bold tabular-nums ${pos ? "text-profit" : "text-loss"}`}>
              {pos ? "+" : "−"}${Math.abs(last).toLocaleString()}
            </span>
            <span className={`font-mono text-xs font-semibold ${pos ? "text-profit" : "text-loss"}`}>
              {pos ? "+" : ""}{ret.toFixed(2)}%
            </span>
          </div>
        </div>
        <span className="font-mono text-[0.65rem] text-faint">{interp(t.vsNotional, { n: `$${notional.toLocaleString()}` })}</span>
      </div>

      <div className="mt-3 h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset={off} stopColor={PROFIT} stopOpacity={0.35} />
                <stop offset={off} stopColor={LOSS} stopOpacity={0.35} />
              </linearGradient>
              <linearGradient id="pnlStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset={off} stopColor={PROFIT} stopOpacity={1} />
                <stop offset={off} stopColor={LOSS} stopOpacity={1} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" hide />
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <ReferenceLine y={0} stroke="#555a63" strokeDasharray="3 3" />
            <Tooltip
              cursor={{ stroke: "#555a63", strokeWidth: 1 }}
              contentStyle={{
                background: "#0d0f13",
                border: "1px solid #1b1e25",
                borderRadius: 8,
                fontFamily: "monospace",
                fontSize: 12,
              }}
              labelFormatter={() => ""}
              formatter={(value) => {
                const v = Number(value);
                return [`${v >= 0 ? "+" : "−"}$${Math.abs(v).toLocaleString()}`, "PnL"];
              }}
            />
            <Area
              type="monotone"
              dataKey="pnl"
              stroke="url(#pnlStroke)"
              strokeWidth={2}
              fill="url(#pnlFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
