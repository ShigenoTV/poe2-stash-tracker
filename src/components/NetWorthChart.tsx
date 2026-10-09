import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { formatValue } from "../lib/format";
import { monotonePath, niceTicks, type HistoryPoint } from "../lib/history";

const RANGES = [
  { key: "24h", label: "24 h", ms: 24 * 3600e3 },
  { key: "7d", label: "7 j", ms: 7 * 24 * 3600e3 },
  { key: "30d", label: "30 j", ms: 30 * 24 * 3600e3 },
  { key: "all", label: "Tout", ms: Infinity },
] as const;

const HEIGHT = 220;
const M = { top: 16, right: 16, bottom: 28, left: 52 };

function shortDate(ms: number, spanMs: number): string {
  const d = new Date(ms);
  if (spanMs <= 36 * 3600e3) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const day = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return spanMs <= 4 * 24 * 3600e3 ? `${day} ${d.getHours()} h` : day;
}

/** Évolution du net worth (Divine) de la ligue courante, avec survol. */
export function NetWorthChart({ history, league }: { history: HistoryPoint[]; league: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("all");
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(800);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points = useMemo(() => {
    const span = RANGES.find((r) => r.key === range)!.ms;
    const now = Date.now();
    return history.filter((p) => p.league === league && now - p.at <= span);
  }, [history, league, range]);

  const header = (
    <div className="chart-head">
      <h2>Évolution du net worth</h2>
      <div className="chart-ranges" role="group" aria-label="Période">
        {RANGES.map((r) => (
          <button key={r.key} type="button" className={range === r.key ? "active" : ""} onClick={() => setRange(r.key)}>
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );

  if (points.length < 2) {
    return (
      <section className="chart" ref={box}>
        {header}
        <p className="muted chart-empty">
          La courbe apparaîtra après ton deuxième snapshot sur cette période (un point au plus toutes les 5 minutes).
        </p>
      </section>
    );
  }

  const t0 = points[0].at;
  const t1 = points[points.length - 1].at;
  const span = Math.max(t1 - t0, 1);
  const ticks = niceTicks(Math.max(...points.map((p) => p.divine)) * 1.05);
  const yMax = ticks[ticks.length - 1] || 1;
  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const X = (at: number) => M.left + ((at - t0) / span) * innerW;
  const Y = (v: number) => M.top + innerH - (v / yMax) * innerH;
  const xy = points.map((p) => ({ x: X(p.at), y: Y(p.divine) }));
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + f * span);

  function onMove(e: PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = M.left + ((e.clientX - r.left) / r.width) * innerW;
    let best = 0;
    xy.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(xy[best].x - x)) best = i;
    });
    setHover(best);
  }

  const h = hover !== null ? points[hover] : null;
  const first = points[0].divine;
  const last = points[points.length - 1].divine;
  const delta = last - first;

  return (
    <section className="chart" ref={box}>
      {header}
      <p className="chart-summary">
        <span className="networth-inline">{formatValue(last)} div</span>{" "}
        <span className={delta >= 0 ? "delta-up" : "delta-down"}>
          {delta >= 0 ? "+" : "−"}
          {formatValue(Math.abs(delta))} div
        </span>{" "}
        <span className="muted">sur la période</span>
      </p>
      <div className="chart-plot">
        <svg width={width} height={HEIGHT} role="img" aria-label={`Net worth de ${formatValue(first)} à ${formatValue(last)} Divine`}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={width - M.right} y1={Y(v)} y2={Y(v)} className="chart-grid" />
              <text x={M.left - 8} y={Y(v) + 4} textAnchor="end" className="chart-tick">
                {formatValue(v)}
              </text>
            </g>
          ))}
          {xTicks.map((at, i) => (
            <text
              key={i}
              x={X(at)}
              y={HEIGHT - 8}
              textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
              className="chart-tick"
            >
              {shortDate(at, span)}
            </text>
          ))}
          <path d={monotonePath(xy)} className="chart-line" />
          {h && hover !== null && (
            <g>
              <line x1={xy[hover].x} x2={xy[hover].x} y1={M.top} y2={M.top + innerH} className="chart-cross" />
              <circle cx={xy[hover].x} cy={xy[hover].y} r={5} className="chart-dot" />
            </g>
          )}
          <rect
            x={M.left}
            y={M.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {h && hover !== null && (
          <div
            className="chart-tooltip"
            style={{ left: Math.min(xy[hover].x + 12, width - 180), top: Math.max(xy[hover].y - 56, 0) }}
          >
            <div className="muted">
              {new Date(h.at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
            </div>
            <div>
              <strong>{formatValue(h.divine)} div</strong> · {formatValue(h.exalted)} ex
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
