import { test, expect } from "@playwright/test";

// All malicious inputs and credentials are synthetic. All external requests are intercepted.
const etab = { etab_id: "audit-etab", etab_name: "Collège Émile Zola", role: "owner" };
const sessionKey = "planningEpsAdminSession2026";
const session = { access_token: "AUDIT-FAKE-ACCESS", refresh_token: "AUDIT-FAKE-REFRESH", expires_at: 4102444800, user: { id: "audit-user", email: "audit@example.invalid" } };
const payload = `<img src="/audit-missing-image" onerror="window.__auditExecuted=true;window.__auditCanReadToken=!!JSON.parse(sessionStorage.getItem('planningEpsAdminSession2026')).refresh_token">`;

async function sandbox(page, { signedIn = true, planning = null, userStatus = 200 } = {}) {
  const requests = [];
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === "http://127.0.0.1:5182") return route.continue();
    requests.push({ path: url.pathname, method: request.method() });
    let body = [], status = 200;
    if (url.pathname.includes("list_current_user_etabs")) body = [etab];
    else if (url.pathname.includes("get_current_user_etab")) body = etab;
    else if (url.pathname.includes("get_current_etab_role")) body = "owner";
    else if (url.pathname.endsWith("/etab_members")) body = [etab];
    else if (url.pathname.endsWith("/etabs")) body = [{ id: etab.etab_id, name: etab.etab_name }];
    else if (url.pathname.endsWith("/eps_plannings")) body = planning ? [{ id: etab.etab_id, etab_id: etab.etab_id, updated_at: "2026-09-26T12:00:00Z", data: planning }] : [];
    else if (url.pathname.endsWith("/auth/v1/user")) { body = userStatus === 200 ? session.user : { message: "Invalid JWT" }; status = userStatus; }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  if (signedIn) await page.addInitScript(({ session, etab, sessionKey }) => {
    if (window.name === "audit-seeded") return;
    window.name = "audit-seeded";
    sessionStorage.setItem(sessionKey, JSON.stringify(session));
  }, { session, etab, sessionKey });
  return requests;
}

for (const entry of ["/", "/standalone.html"]) {
  test(`${entry} XSS-01: un nom de professeur distant ne doit pas exécuter du JavaScript`, async ({ page }) => {
    await sandbox(page, { planning: { etabId: etab.etab_id, teachers: [{ id: "p1", name: payload, color: "#93c5fd", border: "#1d4ed8", weeklyReference: 17, monthlyTarget: 68, weekTargets: { A: 17, B: 17 } }] } });
    await page.goto(entry);
    await page.locator('[data-build-mode="prerequisites"]').click();
    await page.locator('[data-prerequisite-mode="team"]').click();
    await expect(page.locator('[data-rename-teacher]').first()).toHaveValue(payload);
    await page.locator('[data-build-mode="yearPrerequisites"]').click();
    await page.locator('[data-year-prerequisite-mode="events"]').click();
    // Finding includes a harmless proof that the injected code can read a fake refresh token.
    await page.waitForFunction(() => [...document.images].filter(img => img.getAttribute("src") === "/audit-missing-image").every(img => img.complete));
    const proof = await page.evaluate(() => ({ executed: !!window.__auditExecuted, tokenReadable: !!window.__auditCanReadToken }));
    await test.info().attach("xss-proof", { body: JSON.stringify(proof), contentType: "application/json" });
    expect(proof).toEqual({ executed: false, tokenReadable: false });
    await expect(page.locator("#root [onerror], #root [onload]")).toHaveCount(0);
  });

  test(`${entry} XSS-02: un brouillon de message doit rester du texte`, async ({ page }) => {
    await sandbox(page);
    await page.goto(entry);
    await page.locator('[data-week="request"]').click();
    await page.locator("#requestMessage").fill(`</textarea>${payload}<textarea>`);
    await page.locator('[data-week="guide"]').click();
    await page.locator('[data-week="request"]').click();
    await expect(page.locator('#root img[src="/audit-missing-image"]')).toHaveCount(0);
  });

  test(`${entry} AUTH-01: une réponse utilisateur OAuth refusée ne doit pas créer de session`, async ({ page }) => {
    await sandbox(page, { signedIn: false, userStatus: 401 });
    await page.goto(`${entry}#access_token=AUDIT-INVALID&refresh_token=AUDIT-INVALID&expires_in=3600`);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("");
    expect(await page.evaluate(key => sessionStorage.getItem(key), sessionKey)).toBeNull();
  });

  test(`${entry} AUTH-02: la déconnexion doit demander la révocation de session au serveur`, async ({ page }) => {
    const requests = await sandbox(page);
    await page.goto(entry);
    await Promise.all([
      page.waitForEvent("framenavigated", { predicate: frame => frame === page.mainFrame() }),
      page.locator("#logoutAdmin").click()
    ]);
    await page.waitForLoadState();
    await expect.poll(() => requests.some(item => item.path.endsWith("/auth/v1/logout") && item.method === "POST")).toBe(true);
    await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), sessionKey)).toBeNull();
  });

  for (const validUser of [true, false]) {
    test(`${entry} AUTH-PKCE: échange et vérification utilisateur (${validUser})`, async ({ page }) => {
      await sandbox(page, { signedIn: false, userStatus: validUser ? 200 : 401 });
      const redirect = new URL(entry, "http://127.0.0.1:5182").href;
      const verifier = "v".repeat(43);
      await page.addInitScript(({ redirect, verifier }) => sessionStorage.setItem("planningEpsOAuthPKCE", JSON.stringify({ verifier, redirect, backend: "https://kgmhuwuiswabbmeyqibp.supabase.co", created: Date.now() })), { redirect, verifier });
      let exchanged = false;
      await page.route("**/auth/v1/token?grant_type=pkce", async route => {
        expect(route.request().postDataJSON()).toEqual({ auth_code: "FAKE-CODE", code_verifier: verifier });
        exchanged = true;
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...session, expires_in: 3600 }) });
      });
      await page.goto(`${entry}?code=FAKE-CODE`);
      await expect.poll(() => exchanged).toBe(true);
      if (validUser) await expect(page.locator("#logoutAdmin")).toBeVisible();
      else await expect(page.locator("#root")).toContainText("Session refusée");
      const saved = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), sessionKey);
      expect(saved?.user?.id || null).toBe(validUser ? session.user.id : null);
      expect(await page.evaluate(() => location.search)).toBe("");
      expect(await page.evaluate(() => sessionStorage.getItem("planningEpsOAuthPKCE"))).toBeNull();
    });
  }

  test(`${entry} AUTH-PKCE: un retour non sollicité ne déclenche pas d'échange`, async ({ page }) => {
    const requests = await sandbox(page, { signedIn: false });
    await page.goto(`${entry}?code=UNSOLICITED`);
    await expect(page.locator("#root")).toContainText("non initiée");
    expect(requests.some(item => item.path.endsWith("/auth/v1/token"))).toBe(false);
    expect(await page.evaluate(key => sessionStorage.getItem(key), sessionKey)).toBeNull();
  });

  test(`${entry} XSS-CSP: les gestionnaires HTML injectés sont bloqués`, async ({ page }) => {
    await sandbox(page, { signedIn: false });
    await page.goto(entry);
    await page.evaluate(() => {
      const button = document.createElement("button");
      button.setAttribute("onclick", "window.__cspBypass = true");
      document.body.append(button);
      button.click();
      button.remove();
    });
    expect(await page.evaluate(() => !!window.__cspBypass)).toBe(false);
  });

  test(`${entry} CONTROL-01: les erreurs OAuth sont échappées dans la page de connexion`, async ({ page }) => {
    await sandbox(page, { signedIn: false });
    await page.goto(`${entry}#error_description=${encodeURIComponent(payload)}`);
    await expect(page.locator("#root")).toContainText("Connexion OAuth refusée");
    await expect(page.locator('#root img[src="/audit-missing-image"]')).toHaveCount(0);
  });
}
