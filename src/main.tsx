import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Expired/invalid sign-in responses from backend functions (401) are expected
// when a session lapses. Don't let a stray un-awaited call crash the page:
// drop the dead session token so the sign-in screen appears on next load.
const AUTH_ERROR_RE = /\b401\b|invalid or expired dashboard session|invalid_token|not authenticated/i;
window.addEventListener("unhandledrejection", (event) => {
  const reason: any = event.reason;
  const msg = String(reason?.message ?? reason ?? "");
  const status = reason?.context?.status ?? reason?.status;
  if (status === 401 || AUTH_ERROR_RE.test(msg)) {
    event.preventDefault();
    if (/invalid or expired dashboard session|invalid_token/i.test(msg)) {
      try { localStorage.removeItem("dashboard_session_token"); } catch { /* ignore */ }
    }
    console.warn("[auth] Ignored expired-session request:", msg);
  }
});

createRoot(document.getElementById("root")!).render(<App />);
