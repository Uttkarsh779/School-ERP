import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "./styles/tokens.css";
import App from "./App.tsx";
import { Provider } from "react-redux";
import { ToastContainer } from "react-toastify";
import { store } from "./store/store.ts";

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
