import { CHAIN, LINKS } from "../config";
import { THEMES, useTheme } from "../hooks/useTheme";
import { LogoMark } from "./Brand";
import { THEME_ICONS as ICONS, THEME_LABEL as LABEL } from "./themeIcons";


export function ThemeSwitch() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="theme" role="radiogroup" aria-label="Theme">
      {THEMES.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={theme === k}
          className={theme === k ? "on" : ""}
          onClick={() => setTheme(k)}
          title={LABEL[k]}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">{ICONS[k]}</svg>
          <span>{LABEL[k]}</span>
        </button>
      ))}
    </div>
  );
}

export function Footer({ m }) {
  const ex = (a) => `${LINKS.explorer}/address/${a}`;
  const link = (href, label) => (
    <li>
      <a href={href} target="_blank" rel="noreferrer">{label}</a>
    </li>
  );
  return (
    <footer className="footer">
      <div className="foot-brand">
        <p className="foot-name"><LogoMark size={20} />Tenor</p>
        <p className="muted">Fixed rates on Mezo’s MUSD Savings Vault. Running on Mezo Testnet. The contracts have not been audited.</p>
        <ThemeSwitch />
      </div>
      <nav className="foot-cols" aria-label="Footer">
        <div>
          <h3>Product</h3>
          <ul>
            {link(LINKS.proof, "On-chain proof")}
            {link(LINKS.github, "Source code")}
            {link(LINKS.feedback, "Give feedback")}
            <li><a href="#risks">Risks</a></li>
          </ul>
        </div>
        <div>
          <h3>Mezo</h3>
          <ul>
            {link(ex(CHAIN.smusd), "sMUSD vault")}
            {link("https://mezo.org/docs/developers/", "Mezo docs")}
            {link(LINKS.mezoApp, "Mezo testnet app")}
            {link(LINKS.faucet, "Testnet faucet")}
          </ul>
        </div>
        <div>
          <h3>Contracts</h3>
          <ul>
            {link(ex(CHAIN.router), "Router")}
            {link(ex(m.market), "Market")}
            {link(ex(m.pt), "PT token")}
            {link(ex(m.yt), "YT token")}
          </ul>
        </div>
      </nav>
      <p className="foot-legal">© {new Date().getFullYear()} Tenor. Open source under the MIT license. Not financial advice.</p>
    </footer>
  );
}
