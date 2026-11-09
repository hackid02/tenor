// Writes vercel.json: security headers (CSP with hashes of the inline theme
// script), HSTS, and long-lived caching for hashed assets.
// Run after changing any inline <script> in index.html or public/404.html:
//   npm run build && npm run headers
import fs from "node:fs";
import crypto from "node:crypto";

const hashes = new Set();
for (const f of ["dist/index.html", "dist/404.html"]) {
  const html = fs.readFileSync(f, "utf8");
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    hashes.add(`'sha256-${crypto.createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
  }
}

const csp = [
  "default-src 'self'",
  `script-src 'self' ${[...hashes].join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self' https://rpc.test.mezo.org https://rpc-http.mezo.boar.network",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const config = {
  $schema: "https://openapi.vercel.sh/vercel.json",
  framework: "vite",
  headers: [
    {
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ],
    },
    { source: "/assets/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
  ],
};
fs.writeFileSync("vercel.json", JSON.stringify(config, null, 2) + "\n");
console.log(`vercel.json written (${hashes.size} inline script hash${hashes.size === 1 ? "" : "es"})`);
