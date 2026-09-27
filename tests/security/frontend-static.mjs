import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { validatePlanningData } from "../../src/security/data.js";
import { secureBackendUrl } from "../../src/security/transport.js";
import { securityDiagnostics, securityEvent } from "../../src/security/log.js";

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === "object") walk(value, visit);
  }
}
async function scan(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = directory + "/" + item.name;
    if (item.isDirectory()) { await scan(path); continue; }
    if (!/\.(js|jsx|html)$/.test(path)) continue;
    const text = await readFile(path, "utf8");
    assert.ok(!/\uFFFD|Ã[©¨ª´]|â€™/.test(text), "Encodage UTF-8 incorrect : " + path);
    if (path.endsWith(".html")) continue;
    // No business or auth persistence in localStorage; the only access is one-way legacy cleanup.
    assert.ok(!/\blocalStorage\s*(?:\.|\[)/.test(text), "Accès localStorage interdit : " + path);
    if (text.includes("sessionStorage") && !["src/services/auth.js", "src/security/oauth.js", "src/app/bootstrap.js", "src/services/page-memory.js"].includes(path)) {
      assert.fail("Stockage de session hors authentification : " + path);
    }
    walk(parse(text, { sourceType: "module", ecmaVersion: "latest" }), node => {
      let value;
      if (node.type === "AssignmentExpression" && node.left.type === "MemberExpression" && ["innerHTML", "outerHTML"].includes(node.left.property.name)) value = node.right;
      if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && node.callee.property.name === "insertAdjacentHTML") value = node.arguments[1];
      if (value) assert.ok(value.type === "CallExpression" && value.callee.name === "safeHtml", "Insertion HTML non filtrée : " + path);
    });
  }
}
await scan("src");
const standalone = await readFile("standalone.html", "utf8");
const script = standalone.match(/<script>([\s\S]*?)<\/script>/)[1];
assert.ok(standalone.includes("'sha256-" + createHash("sha256").update(script).digest("base64") + "'"), "Empreinte CSP invalide");
assert.throws(() => validatePlanningData(JSON.parse('{"__proto__":{"polluted":true}}')));
assert.throws(() => validatePlanningData({ teachers: "invalid" }));
assert.throws(() => validatePlanningData({ activities: [null] }));
assert.throws(() => validatePlanningData({ label: "x".repeat(100001) }));
validatePlanningData({ teachers: [{ id: "p1", name: "Élodie", weekTargets: { A: 17, B: 17 } }] });
for (const url of ["http://example.invalid", "https://user:secret@example.invalid", "https://example.invalid/path", "https://example.invalid?token=x"]) assert.throws(() => secureBackendUrl(url));
assert.equal(secureBackendUrl("https://example.invalid/"), "https://example.invalid");
for (let i=0; i<60; i++) securityEvent("save_failed", { token: "MUST-NOT-LOG" });
securityEvent("MUST-NOT-LOG");
assert.equal(securityDiagnostics().length, 50);
assert.ok(!JSON.stringify(securityDiagnostics()).includes("MUST-NOT-LOG"));
console.log("PASS : insertions HTML, empreinte CSP, UTF-8, validation des données, HTTPS et journaux minimaux.");
