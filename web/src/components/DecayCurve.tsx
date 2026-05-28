import { currentTaxBps, decaySeries, formatPercent } from "@/lib/data/decay";

type Props = {
  startBps: number;
  windowSec: number;
  /** seconds elapsed since migration (drives the "now" marker) */
  elapsedSec: number;
  className?: string;
  showMarker?: boolean;
};

const W = 360;
const H = 200;
const PAD = 18;

// Pure SVG decay curve. The line draws on load (stroke-dashoffset), the "now" marker sits where the
// tax currently is along the 30-day decay. Lime line cooling to an amber marker, from fresh to decaying.
export function DecayCurve({ startBps, windowSec, elapsedSec, className, showMarker = true }: Props) {
  const pts = decaySeries(startBps, windowSec, 48);
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;

  const x = (t: number) => PAD + (t / windowSec) * plotW;
  const y = (bps: number) => PAD + (1 - bps / startBps) * plotH;

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(2)},${y(p.bps).toFixed(2)}`).join(" ");
  const area = `${line} L${x(windowSec).toFixed(2)},${(H - PAD).toFixed(2)} L${PAD},${(H - PAD).toFixed(2)} Z`;

  const progress = Math.min(1, Math.max(0, elapsedSec / windowSec));
  const nowBps = currentTaxBps(startBps, 0, elapsedSec, windowSec);
  const mx = PAD + progress * plotW;
  const my = y(nowBps);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label={`Creator tax decay from ${formatPercent(startBps, 0)} to 0% over ${Math.round(windowSec / 86_400)} days`}
    >
      <defs>
        <linearGradient id="decayFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* horizontal guides */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={PAD}
          x2={W - PAD}
          y1={PAD + f * plotH}
          y2={PAD + f * plotH}
          stroke="var(--color-line)"
          strokeWidth="1"
        />
      ))}

      <path d={area} fill="url(#decayFill)" />
      <path
        d={line}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset="1"
        style={{ animation: "draw 1.6s cubic-bezier(.2,.7,.2,1) .2s forwards" }}
      />

      {showMarker && (
        <g>
          <line x1={mx} x2={mx} y1={PAD} y2={H - PAD} stroke="var(--color-decay)" strokeWidth="1" strokeDasharray="3 4" opacity="0.5" />
          <circle cx={mx} cy={my} r="5.5" fill="var(--color-decay)" />
          <circle cx={mx} cy={my} r="5.5" fill="none" stroke="var(--color-decay)" strokeWidth="1.5" opacity="0.4">
            <animate attributeName="r" from="5.5" to="13" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.4" to="0" dur="1.8s" repeatCount="indefinite" />
          </circle>
        </g>
      )}

      {/* axis labels (the headline % is rendered by the parent card, so it is not repeated here) */}
      <text x={PAD} y={H - 4} className="font-mono" fontSize="9" fill="var(--color-faint)">
        day 0
      </text>
      <text x={W - PAD} y={H - 4} textAnchor="end" className="font-mono" fontSize="9" fill="var(--color-faint)">
        day {Math.round(windowSec / 86_400)}
      </text>
      <text x={PAD} y={PAD - 6} className="font-mono" fontSize="9" fill="var(--color-faint)">
        {formatPercent(startBps, 0)}
      </text>
    </svg>
  );
}
