// Before anything else: what LibreTeX left in localStorage under its name (see the module).
import "./lib/migrateStorageAtStart";
import { isTauri } from "@tauri-apps/api/core";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { IS_WINDOWS } from "./lib/platform";
import { windowsFileDrops } from "./lib/windowsDrop";
import "./styles/index.css";

// On Windows the page takes the files dropped from the Explorer from the start, so none is
// ever opened by WebView2 (see lib/windowsDrop.ts).
if (isTauri() && IS_WINDOWS) windowsFileDrops();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
