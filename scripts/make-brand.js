// Renders Tenor's share image and icons into app/public.
//   node scripts/make-brand.js
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const out = path.join(__dirname, "..", "app", "public");
fs.mkdirSync(out, { recursive: true });

const ACCENT = "#34c39f";
const INK = "#eceef0";
const MUTED = "#9aa1aa";
const BG = "#0e1012";
const SURFACE = "#15181b";
const LINE = "#2a3036";
const FONT = "Segoe UI, Helvetica Neue, Arial, sans-serif";

// The Tenor mark: a split coin. Solid half = PT (fixed), dashed half = YT (variable).
const GLYPH = (fg) =>
  `<path d="M14.5 4.5A11.5 11.5 0 0 0 14.5 27.5Z" fill="${fg}"/>` +
  `<path d="M17.5 6A10 10 0 0 1 25.16 9.572M26.563 11.774A10 10 0 0 1 26.563 20.226M25.16 22.428A10 10 0 0 1 17.5 26" fill="none" stroke="${fg}" stroke-width="3"/>`;
// App-icon tile: white glyph on the brand green.
const tile = (bg = "#0b7a62", fg = "#ffffff") =>
  `<rect width="32" height="32" rx="8" fill="${bg}"/><g transform="translate(16 16) scale(0.72) translate(-16 -16)">${GLYPH(fg)}</g>`;
const mark = (size, radius) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${tile().replace('rx="8"', `rx="${radius}"`)}</svg>`;

// 1200x630 share card: what Tenor does, and the PT/YT split in one picture.
const og = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${BG}"/>
  <g transform="translate(80 76)">
    <g transform="scale(1.5)">${tile()}</g>
    <text x="66" y="35" font-family="${FONT}" font-size="30" font-weight="700" fill="${INK}">Tenor</text>
  </g>
  <text x="80" y="268" font-family="${FONT}" font-size="66" font-weight="700" fill="${INK}" letter-spacing="-1.5">Fixed rates on</text>
  <text x="80" y="346" font-family="${FONT}" font-size="66" font-weight="700" fill="${ACCENT}" letter-spacing="-1.5">Mezo MUSD</text>
  <text x="80" y="412" font-family="${FONT}" font-size="27" fill="${MUTED}">Lock the sMUSD savings rate, or sell your</text>
  <text x="80" y="450" font-family="${FONT}" font-size="27" fill="${MUTED}">future yield for MUSD today.</text>
  <text x="80" y="560" font-family="${FONT}" font-size="22" fill="${MUTED}">Built on Mezo: MUSD, sMUSD and Mezo Pools</text>

  <g transform="translate(760 150)" font-family="${FONT}">
    <rect width="360" height="330" rx="22" fill="${SURFACE}" stroke="${LINE}"/>
    <text x="32" y="58" font-size="20" fill="${MUTED}">1 MUSD deposited</text>
    <rect x="32" y="78" width="296" height="54" rx="12" fill="#1f2a27" stroke="${LINE}"/>
    <text x="52" y="113" font-size="22" font-weight="600" fill="${INK}">sMUSD</text>
    <path d="M180 140v28M180 168H96v26M180 168h84v26" stroke="${LINE}" stroke-width="2.5" fill="none"/>
    <rect x="32" y="200" width="136" height="98" rx="12" fill="#0b7a62"/>
    <text x="52" y="240" font-size="24" font-weight="700" fill="#fff">PT</text>
    <text x="52" y="272" font-size="19" fill="#d7f2ea">fixed</text>
    <rect x="192" y="200" width="136" height="98" rx="12" fill="#1f2a27" stroke="${ACCENT}" stroke-width="2" stroke-dasharray="7 6"/>
    <text x="212" y="240" font-size="24" font-weight="700" fill="${INK}">YT</text>
    <text x="212" y="272" font-size="19" fill="${MUTED}">variable</text>
  </g>
</svg>`;

function png(svg, file, width) {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: true } });
  fs.writeFileSync(path.join(out, file), r.render().asPng());
}

fs.writeFileSync(path.join(out, "favicon.svg"), mark(32, 8).trim() + "\n");
png(og, "og.png", 1200);
png(mark(180, 0), "apple-touch-icon.png", 180); // iOS rounds the corners itself
png(mark(32, 8), "favicon-32.png", 32);
console.log("wrote og.png, favicon.svg, favicon-32.png, apple-touch-icon.png");
