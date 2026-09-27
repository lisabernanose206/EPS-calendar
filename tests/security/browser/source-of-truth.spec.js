import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

const origin = "https://eps.invalid";
const backend = "https://kgmhuwuiswabbmeyqibp.supabase.co";
const sessionKey = "planningEpsAdminSession2026";
const teacher = name => ({ id: "p1", name, color: "#93c5fd", border: "#1d4ed8", weeklyReference: 17, monthlyTarget: 68, weekTargets: { A: 17, B: 17 } });

async function server(page) {
  const html = await readFile("standalone.html", "utf8");
  const user = { id: "storage-user", email: "storage@example.invalid", user_metadata: {} };
  const memberships = [
    { etab_id: "A", etab_name: "Collège A", role: "owner" },
    { etab_id: "B", etab_name: "Collège B", role: "owner" }
  ];
  const rows = Object.fromEntries(["A", "B"].map(id => [id, {
    id, etab_id: id, updated_at: "2026-09-27T00:00:00.000Z",
    data: { etabId: id, teachers: [teacher("Professeur " + id)], activities: [{ id: "course", name: "Course" }] }
  }]));
  const control = { reads: 0, writes: 0, offline: false, rows, user, memberships };
  await page.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === origin && url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
    if (url.origin !== backend) return route.fulfill({ body: "" });
    let data = [];
    if (url.pathname.endsWith("/auth/v1/user")) {
      if (req.method() === "PUT") Object.assign(user.user_metadata, req.postDataJSON().data);
      data = user;
    } else if (url.pathname.endsWith("/list_current_user_etabs")) data = memberships;
    else if (url.pathname.endsWith("/get_current_etab_role")) data = "owner";
    else if (url.pathname.endsWith("/etabs")) data = memberships.map(x => ({ id: x.etab_id, name: x.etab_name }));
    else if (url.pathname.endsWith("/eps_plannings")) {
      if (control.offline) return route.abort("failed");
      const id = (url.searchParams.get("etab_id") || "eq.A").slice(3);
      if (req.method() === "GET") { control.reads++; if (control.holdRead) await control.holdRead(id); data = rows[id] ? [rows[id]] : []; }
      else {
        control.writes++;
        const payload = req.postDataJSON();
        if (req.method() === "PATCH" && url.searchParams.get("updated_at") !== "eq." + rows[payload.etab_id].updated_at) data = [];
        else { rows[payload.etab_id] = payload; data = [payload]; }
      }
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.addInitScript(({ sessionKey, user }) => {
    if (!sessionStorage.getItem(sessionKey)) sessionStorage.setItem(sessionKey, JSON.stringify({
      access_token: "FAKE-STORAGE-TOKEN", refresh_token: "FAKE-REFRESH", expires_at: 4102444800, user
    }));
  }, { sessionKey, user });
  return control;
}

async function openTeam(page, name) {
  await page.locator('[data-build-mode="prerequisites"]').click();
  await page.locator('[data-prerequisite-mode="team"]').click();
  const field = page.locator('[data-rename-teacher]').first();
  await expect(field).toHaveValue(name);
  return field;
}
async function expectOnlySession(page) {
  const stored = await page.evaluate(() => ({
    local: Object.keys(localStorage).filter(key => key.startsWith("planningEps")),
    session: Object.keys(sessionStorage).filter(key => key.startsWith("planningEps")),
    auth: JSON.parse(sessionStorage.getItem("planningEpsAdminSession2026"))
  }));
  expect(stored.local).toEqual([]);
  expect(stored.session).toEqual([sessionKey]);
  expect(stored.auth.user).not.toHaveProperty("user_metadata");
}

test("Supabase est relu après sauvegarde et rechargement sans cache métier", async ({ page }) => {
  const remote = await server(page);
  await page.addInitScript(() => {
    if (!window.name) {
      localStorage.setItem("planningEpsTeachers2026", JSON.stringify([{ name: "Ancienne copie locale" }]));
      localStorage.setItem("planningEpsEtabRole2026", "owner");
      sessionStorage.setItem("planningEpsTeachers2026", "ancienne copie de session");
      localStorage.setItem("unrelated-app", "keep");
      window.name = "legacy-seeded";
    }
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) {
      if (this === window.localStorage) throw new Error("Lecture locale interdite");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function(key, value) {
      if (this === window.localStorage) throw new Error("Écriture locale interdite");
      return set.call(this, key, value);
    };
  });
  await page.goto(origin);
  const input = await openTeam(page, "Professeur A");
  await input.fill("Élodie Noël");
  await input.dispatchEvent("change");
  await expect.poll(() => remote.rows.A.data.teachers[0].name).toBe("Élodie Noël");
  await expectOnlySession(page);
  remote.rows.A.data.teachers[0].name = "Nouvelle version Supabase";
  await page.reload();
  await openTeam(page, "Nouvelle version Supabase");
  await expectOnlySession(page);
  expect(remote.reads).toBeGreaterThanOrEqual(3);
  expect(await page.evaluate(() => Object.keys(localStorage))).toContain("unrelated-app");
});

test("Une lecture Supabase échouée bloque le planning puis permet de réessayer", async ({ page }) => {
  const remote = await server(page);
  remote.offline = true;
  await page.goto(origin);
  await expect(page.locator("#retryCloudLoad")).toBeVisible();
  await expect(page.locator("#root")).toContainText("Lecture de Supabase");
  await expect(page.locator('[data-rename-teacher]')).toHaveCount(0);
  expect(remote.writes).toBe(0);
  remote.offline = false;
  await page.locator("#retryCloudLoad").click();
  await openTeam(page, "Professeur A");
  await expectOnlySession(page);
});

test("Une sauvegarde échouée ne survit pas comme copie locale au rechargement", async ({ page }) => {
  const remote = await server(page);
  await page.goto(origin);
  const input = await openTeam(page, "Professeur A");
  remote.offline = true;
  await input.fill("Brouillon non sauvegardé");
  await input.dispatchEvent("change");
  await expect(page.locator("body")).toContainText("Sauvegarde impossible");
  expect(remote.rows.A.data.teachers[0].name).toBe("Professeur A");
  await expectOnlySession(page);
  page.on("dialog", dialog => dialog.accept());
  remote.offline = false;
  await page.reload();
  await openTeam(page, "Professeur A");
});

test("Changer d’établissement et définir le défaut utilise Supabase sans conserver de rôle local", async ({ page }) => {
  const remote = await server(page);
  await page.goto(origin);
  await openTeam(page, "Professeur A");
  page.on("dialog", dialog => dialog.accept());
  await page.locator("#openEtabSwitch").click();
  await page.locator('[data-switch-etab="B"]').click();
  await openTeam(page, "Professeur B");
  await page.locator('[data-week="account"]').click();
  await page.locator('[data-set-default-etab="B"]').click();
  await expect.poll(() => remote.user.user_metadata.eps_default_etab_id).toBe("B");
  await expectOnlySession(page);
  await page.reload();
  await expect(page.locator("#brandEtabName")).toContainText("Collège B");
  await openTeam(page, "Professeur B");
  remote.memberships[1].role = "member";
  await page.reload();
  await expect(page.locator("#brandEtabName")).toContainText("Collège B");
  await page.locator('[data-build-mode="planning"]').evaluate(button => button.click());
  await expect(page.locator(".constructionPage")).toHaveCount(0);
  await expectOnlySession(page);
});
test("Changer d’établissement pendant une lecture charge la nouvelle source sans reprendre l’ancienne", async ({ page }) => {
  const remote = await server(page);
  let release;
  const held = new Promise(resolve => release = resolve);
  remote.holdRead = id => id === "A" ? held : Promise.resolve();
  await page.goto(origin);
  await expect.poll(() => remote.reads).toBe(1);
  page.on("dialog", dialog => dialog.accept());
  await page.locator("#openEtabSwitch").click();
  await page.locator('[data-switch-etab="B"]').click();
  release();
  await openTeam(page, "Professeur B");
  await expectOnlySession(page);
});
