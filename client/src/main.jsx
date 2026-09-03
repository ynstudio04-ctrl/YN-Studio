document.body.classList.add('admin-app');
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./index.css";
import { registerPWA } from "./pwa";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const originalFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = typeof input === "string" ? input : input?.url || "";
  if (url.startsWith(API_URL)) {
    const token = localStorage.getItem("yn_token");
    if (token) {
      const headers = new Headers(init.headers || (typeof input !== "string" ? input.headers : undefined));
      if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
      init = { ...init, headers };
    }
  }
  return originalFetch(input, init);
};


registerPWA();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);