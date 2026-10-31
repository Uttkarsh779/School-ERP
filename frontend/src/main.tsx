import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "./styles/tokens.css";
import App from "./App.tsx";
import { Provider } from "react-redux";
import { ToastContainer } from "react-toastify";
import { store } from "./store/store.ts";

// The installed app (PWA) opens on the ERP, not the school website. Phones keep the start
// address they saw at install time (iOS never refreshes it), so this check doesn't rely on the
// manifest: a launch of the installed app at "/" goes to the login, which forwards signed-in
// users to their dashboard. Only at launch, so the in-app "School website" link still works.
const isInstalledApp =
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
if (isInstalledApp && window.location.pathname === "/") {
  window.history.replaceState(null, "", "/admin/login");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Provider store={store}>
        <ToastContainer />
        <App />
      </Provider>
    </BrowserRouter>
  </StrictMode>
);
