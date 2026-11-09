import { Component } from "react";

/**
 * If anything in the app throws while rendering, show a short, useful page
 * instead of a blank screen. Funds are never at risk from a display error.
 */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Tenor UI error", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="crash" role="alert">
        <h1>Something went wrong on this page</h1>
        <p>
          Your funds are not affected: they are held by the Tenor contracts on Mezo, not by this page. Reload to try
          again. If it keeps happening, the contracts can also be used directly from the Mezo explorer.
        </p>
        <div className="actions">
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <a className="btn ghost" href="https://github.com/hackid02/tenor/issues" target="_blank" rel="noreferrer">
            Report the problem
          </a>
        </div>
      </main>
    );
  }
}
