import shell from "./shell.html?raw";
import { initializeState } from "./initialize.js";
import { bootstrapApp } from "./bootstrap.js";

import { bindShellNavigation } from "../ui/navigation.js";

export function startApp() {
  document.title = "EPS Loustic";
  document.body.innerHTML = shell;
  initializeState();
  bindShellNavigation();
  return bootstrapApp();
}
