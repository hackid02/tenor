import { useEffect, useRef } from "react";
import { percent } from "../lib/format";

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
const sleep = (ms, signal) =>
  new Promise((res, rej) => {
    const id = setTimeout(res, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(id);
      rej(new DOMException("stop", "AbortError"));
    });
  });

function Arrow() {
  return (
    <svg className="cursor-arrow" viewBox="0 0 16 20" aria-hidden="true">
      <path d="M1 1l13 8.5-6 1.2-3 7.3z" />
    </svg>
  );
}

/**
 * Two labelled cursors act out Tenor on the How-it-works diagram, in the
 * style of multiplayer cursors: a Saver fixes a rate with PT, a Trader takes
 * the variable side with YT. Illustrative only. Runs while on screen and
 * never runs when the user prefers reduced motion.
 */
export function Cursors({ flowRef, apy, maturityLabel }) {
  const saver = useRef(null);
  const trader = useRef(null);
  const saverTag = useRef(null);
  const traderTag = useRef(null);
  const apyRef = useRef(apy);
  apyRef.current = apy;

  useEffect(() => {
    const flow = flowRef.current;
    if (!flow || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let ctrl = null;

    const node = (name) => flow.querySelector(`[data-node="${name}"]`);
    const point = (name, fx = 0.86, fy = 0.94) => {
      const f = flow.getBoundingClientRect();
      const r = node(name).getBoundingClientRect();
      return { x: r.left - f.left + r.width * fx, y: r.top - f.top + r.height * fy };
    };
    const at = (el) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return { x: m.m41, y: m.m42 };
    };
    async function move(el, to, ms, signal) {
      const from = at(el);
      const a = el.animate(
        [{ transform: `translate(${from.x}px, ${from.y}px)` }, { transform: `translate(${to.x}px, ${to.y}px)` }],
        { duration: ms, easing: EASE, fill: "forwards" }
      );
      signal.addEventListener("abort", () => a.cancel());
      await a.finished;
      el.style.transform = `translate(${to.x}px, ${to.y}px)`;
      a.cancel();
    }
    async function click(el, name, signal) {
      el.classList.add("press");
      node(name).classList.add("hit");
      await sleep(180, signal);
      el.classList.remove("press");
      await sleep(260, signal);
      node(name).classList.remove("hit");
    }
    const show = (el, on) => el.classList.toggle("on", on);
    const place = (el, p) => (el.style.transform = `translate(${p.x}px, ${p.y}px)`);

    async function run(signal) {
      const s = saver.current;
      const t = trader.current;
      while (!signal.aborted) {
        const f = flow.getBoundingClientRect();
        place(s, { x: -24, y: f.height * 0.15 });
        place(t, { x: f.width + 8, y: f.height * 0.9 });
        show(s, true);
        await sleep(300, signal);

        await move(s, point("musd"), 900, signal);
        await click(s, "musd", signal);
        await move(s, point("vault"), 900, signal);
        await click(s, "vault", signal);

        show(t, true);
        const toYt = move(t, point("yt"), 1200, signal);
        await move(s, point("pt"), 800, signal);
        await click(s, "pt", signal);
        saverTag.current.textContent =
          apyRef.current != null ? `Saver locks ${percent(apyRef.current)} until ${maturityLabel}` : `Saver fixes the rate until ${maturityLabel}`;
        show(saverTag.current, true);

        await toYt;
        await click(t, "yt", signal);
        show(traderTag.current, true);

        await sleep(2400, signal);
        show(saverTag.current, false);
        show(traderTag.current, false);
        show(s, false);
        show(t, false);
        await sleep(1600, signal);
      }
    }

    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !ctrl) {
          ctrl = new AbortController();
          run(ctrl.signal).catch(() => {});
        } else if (!e.isIntersecting && ctrl) {
          ctrl.abort();
          ctrl = null;
          for (const el of flow.querySelectorAll(".hit")) el.classList.remove("hit");
        }
      },
      { threshold: 0.5 }
    );
    io.observe(flow);
    return () => {
      io.disconnect();
      ctrl?.abort();
    };
  }, [flowRef, maturityLabel]);

  return (
    <div className="cursors" aria-hidden="true">
      <div className="cursor saver" ref={saver}>
        <Arrow />
        <span className="cursor-label">Saver</span>
      </div>
      <div className="cursor trader" ref={trader}>
        <Arrow />
        <span className="cursor-label">Trader</span>
      </div>
      <div className="flow-captions">
        <span className="cap saver-cap" ref={saverTag} />
        <span className="cap trader-cap" ref={traderTag}>Trader takes the variable sMUSD rate</span>
      </div>
    </div>
  );
}
