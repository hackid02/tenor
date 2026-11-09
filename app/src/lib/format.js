import { parseUnits } from "viem";

/** Keeps a typed amount to digits and one decimal point (commas become points). */
export function cleanAmount(raw) {
  let s = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "").slice(0, 18);
  if (s.startsWith(".")) s = "0" + s;
  return s.slice(0, 30);
}

/** Exact wei from a typed amount string, or null if it is not a usable amount. */
export function toWei(s) {
  if (!s || s === "." || !/^\d*\.?\d*$/.test(s)) return null;
  try {
    const v = parseUnits(s, 18);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

/** Wei for a computed amount (quotes, limits). Rounds down to 12 decimals. */
export function numToWei(x) {
  if (!Number.isFinite(x) || x <= 0) return 0n;
  return parseUnits(x.toFixed(12), 18);
}

const nf = (d) => new Intl.NumberFormat(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
export function amount(x, d = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "–";
  if (x !== 0 && Math.abs(x) < 10 ** -d) return `<${nf(d).format(10 ** -d)}`;
  return nf(d).format(x);
}

export function percent(x, d = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "–";
  return `${nf(d).format(x * 100)}%`;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
export const date = (unix) => dateFmt.format(new Date(unix * 1000));

const plural = new Intl.PluralRules();
const unit = (n, one, many) => `${n} ${plural.select(n) === "one" ? one : many}`;

/** "52 days", "1 day", "7 hours", "matured". */
export function timeLeft(seconds) {
  if (seconds <= 0) return "Matured";
  if (seconds < 86400) return unit(Math.max(1, Math.round(seconds / 3600)), "hour", "hours");
  return unit(Math.floor(seconds / 86400), "day", "days");
}

export const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
