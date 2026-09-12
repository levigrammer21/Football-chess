import React, { Component, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { connect } from "./firebase-client";
import "./styles.css";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    return this.state.error ? (
      <main className="auth">
        <h1>Unable to display this screen</h1>
        <p>{this.state.error}</p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
const root = createRoot(document.getElementById("root")!);
root.render(<div className="loading">Opening the clubhouse…</div>);
connect()
  .then((api) =>
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App api={api} />
        </ErrorBoundary>
      </React.StrictMode>,
    ),
  )
  .catch((e) =>
    root.render(
      <main className="auth">
        <div className="brand-mark">GC</div>
        <h1>
          Connect your
          <br />
          Firebase project
        </h1>
        <p>
          {e.message.includes("JSON")
            ? "This build needs Firebase Hosting configuration."
            : e.message}
        </p>
        <p>
          The project includes a complete phone-operated deployment guide in
          README.md. Once deployed to Firebase Hosting, configuration loads
          automatically.
        </p>
        <button className="primary" onClick={() => location.reload()}>
          Retry connection
        </button>
      </main>,
    ),
  );
if ("serviceWorker" in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
