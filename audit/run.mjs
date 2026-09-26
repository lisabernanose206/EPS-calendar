import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const suites = [
  ["audit/frontend-static.mjs"],
  ["audit/sql-security.mjs"],
  ["audit/runtime-security.mjs"],
  ["node_modules/@playwright/test/cli.js", "test", "--config", "audit/playwright.config.js"]
];
let failed = false;
for (const args of suites) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: "inherit", windowsHide: true });
  if (result.error) console.error(result.error.message);
  failed ||= result.status !== 0;
}
process.exitCode = failed ? 1 : 0;
