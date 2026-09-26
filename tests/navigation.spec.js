import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";

const establishment = { etab_id: "test-etab", etab_name: "Collège Émile Zola", role: "owner" };

async function mockSession(page, role = "owner") {
  // No request can leave the local test server, including mutations.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:5173)/, async route => {
    const url = route.request().url();
    let data = [];
    if (url.includes("list_current_user_etabs")) data = [{ ...establishment, role }];
    else if (url.includes("get_current_user_etab")) data = { ...establishment, role };
    else if (url.includes("get_current_etab_role")) data = role;
    else if (url.includes("/etab_members")) data = [{ ...establishment, role }];
    else if (url.includes("/etabs?")) data = [{ id: establishment.etab_id, name: establishment.etab_name }];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.addInitScript(({ role, establishment }) => {
    localStorage.setItem("planningEpsAdminSession2026", JSON.stringify({
      access_token: "test-only-token", expires_at: 4102444800,
      user: { id: "test-user", email: "test@example.invalid" }
    }));
    localStorage.setItem("planningEpsEtabRole2026", role);
    localStorage.setItem("planningEpsEtabName2026", establishment.etab_name);
    localStorage.setItem("planningEpsCloudConfig2026", JSON.stringify({ etabId: establishment.etab_id }));
  }, { role, establishment });
}

for (const entry of ["/", "/standalone.html", "/dist/index.html", pathToFileURL(resolve("standalone.html")).href]) {
  test(`${entry}: écran de connexion sans erreur`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:5173)/, route => route.abort());
    await page.goto(entry);
    await expect(page.locator("#root")).toContainText("Google");
    await expect(page.locator("img").first()).toHaveJSProperty("complete", true);
    expect(await page.locator("img").first().evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    expect(await page.locator("body").innerText()).not.toMatch(/�|Ã©|Ã¨|â€™/);
    expect(await page.evaluate(() => typeof window.render)).toBe("undefined");
  });

  test(`${entry}: navigation et sous-onglets administrateur`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" && !message.text().includes("resource")) errors.push(message.text()); });
    await mockSession(page);
    await page.goto(entry);
    await expect(page.locator("#brandEtabName")).toContainText("Émile Zola");
    for (const week of ["current", "year", "cycle", "guide", "request", "account"]) {
      await page.locator(`[data-week="${week}"]`).click();
      await expect(page.locator("#root")).not.toBeEmpty();
      await expect(page.locator("#root")).not.toContainText("Affichage interrompu");
    }
    await page.locator('[data-build-mode="prerequisites"]').click();
    for (const mode of ["establishment", "team", "classes", "facilitiesActivities", "program"]) {
      await page.locator(`[data-prerequisite-mode="${mode}"]`).click();
      await expect(page.locator(`[data-prerequisite-mode="${mode}"]`)).toHaveClass(/active/);
      expect(await page.locator("#root").innerText()).not.toMatch(/�|Ã©|Ã¨|â€™/);
    }
    await page.locator('[data-build-mode="yearPrerequisites"]').click();
    for (const mode of ["unavailable", "cycles", "as", "events", "hours"]) {
      await page.locator(`[data-year-prerequisite-mode="${mode}"]`).click();
      await expect(page.locator(`[data-year-prerequisite-mode="${mode}"]`)).toHaveClass(/active/);
    }
    await expect(page.locator('[data-build-mode="planning"]')).toBeDisabled();
    await expect(page.locator("#root")).not.toBeEmpty();
    // A draft must survive navigation: modules share one state instance.
    await page.locator('[data-week="request"]').click();
    await page.locator("#requestAuthor").fill("Élodie");
    await page.locator("#requestMessage").fill("Vérification des périodes et des élèves.");
    await page.locator('[data-week="guide"]').click();
    await page.locator('[data-week="request"]').click();
    await expect(page.locator("#requestAuthor")).toHaveValue("Élodie");
    await expect(page.locator("#requestMessage")).toHaveValue("Vérification des périodes et des élèves.");
    expect(errors).toEqual([]);
  });


  test(`${entry}: construction et modification d’un professeur`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" && !message.text().includes("resource")) errors.push(message.text()); });
    await mockSession(page);
    await page.addInitScript(() => {
      localStorage.setItem("planningEpsActivities2026", JSON.stringify([{ id: "course", name: "Course à pied" }]));
    });
    await page.goto(entry);
    await expect(page.locator("#brandEtabName")).toContainText("Émile Zola");
    await page.locator('[data-build-mode="planning"]').click();
    for (const mode of ["blocks", "cycleDetails", "versions"]) {
      await page.locator(`[data-construction-build-mode="${mode}"]`).click();
      await expect(page.locator(`[data-construction-build-mode="${mode}"]`)).toHaveClass(/active/);
    }
    await page.locator('[data-build-mode="prerequisites"]').click();
    await page.locator('[data-prerequisite-mode="team"]').click();
    const teacher = page.locator('[data-rename-teacher]').first();
    await teacher.fill("Élodie Noël");
    await teacher.dispatchEvent("change");
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("planningEpsTeachers2026"))[0].name)).toBe("Élodie Noël");
    await page.locator('[data-week="year"]').click();
    await page.locator('[data-build-mode="prerequisites"]').click();
    await page.locator('[data-prerequisite-mode="team"]').click();
    await expect(page.locator('[data-rename-teacher]').first()).toHaveValue("Élodie Noël");
    expect(errors).toEqual([]);
  });

  test(`${entry}: un membre ne peut pas ouvrir la construction via la navigation`, async ({ page }) => {
    await mockSession(page, "member");
    await page.goto(entry);
    await expect(page.locator("#brandEtabName")).toContainText("Émile Zola");
    await page.locator('[data-build-mode="planning"]').evaluate(button => button.click());
    await expect(page.locator(".constructionPage")).toHaveCount(0);
    await expect(page.locator('[data-week="current"]')).toHaveClass(/active/);
  });
}
