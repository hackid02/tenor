import { useEffect, useState } from "react";

/**
 * Measures an element's width so charts draw at real pixel size: no
 * stretched SVG, round dots stay round and strokes stay 1px crisp.
 */
export function useWidth(fallback = 320) {
  // Callback ref: measures whenever the element mounts, even if the chart
  // first rendered nothing while its data loaded.
  const [el, ref] = useState(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(160, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [ref, w];
}

/** Pointer position over a chart as a 0..1 fraction of the plot width, or null. */
export function useHover(plotLeft, plotWidth) {
  const [f, setF] = useState(null);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    setF(Math.min(1, Math.max(0, (px - plotLeft) / plotWidth)));
  };
  return { f, bind: { onPointerMove: onMove, onPointerDown: onMove, onPointerLeave: () => setF(null) } };
}

/** About `n` round tick values covering [lo, hi]. */
export function ticks(lo, hi, n = 3) {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return { values: out, step };
}

/** Decimals that show the difference between neighbouring ticks. */
export const tickDecimals = (step) => Math.max(0, Math.min(4, -Math.floor(Math.log10(step) + 1e-9)));

/** First day of each month strictly between two unix times. */
export function monthStarts(t0, t1) {
  const out = [];
  const d = new Date(t0 * 1000);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  for (;;) {
    d.setUTCMonth(d.getUTCMonth() + 1);
    const t = d.getTime() / 1000;
    if (t >= t1) break;
    out.push(t);
  }
  return out;
}

export const monthName = (t) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
export const dayLabel = (t) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
