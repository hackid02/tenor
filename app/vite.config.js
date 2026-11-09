import fs from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `vite preview` serves the production build with the same security headers
// Vercel will send, so the CSP can be checked locally before deploying.
function vercelHeaders() {
  try {
    const cfg = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
    const all = cfg.headers.find((h) => h.source === "/(.*)");
    return Object.fromEntries(all.headers.map((h) => [h.key, h.value]));
  } catch {
    return {};
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: { headers: vercelHeaders() },
});
