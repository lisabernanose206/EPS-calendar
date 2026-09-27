import { installErrorBoundary, showAppFailure } from "./error-boundary.js";
import { render } from "./render.js";
import { state } from "./state.js";
import { purgeLegacyBrowserData } from "../services/page-memory.js";
import { safeHtml } from "../security/html.js";
import shell from "./shell.html?raw";
import { initializeState } from "./initialize.js";
import { bootstrapApp } from "./bootstrap.js";

import { bindShellNavigation } from "../ui/navigation.js";

export async function startApp() {
  installErrorBoundary({ retry: render, home: () => { state.week = "current"; render(); } });
  try {
    purgeLegacyBrowserData();
    document.title = "EPS Loustic";
    document.body.innerHTML = safeHtml(shell);
    initializeState();
    bindShellNavigation();
    await bootstrapApp();
  } catch {
    showAppFailure(true);
  }
}
