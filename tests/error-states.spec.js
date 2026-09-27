import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { generateNotFound } from "../scripts/build-errors.mjs";

for (const entry of ["/", "/standalone.html"]) {
  test(entry + ": erreur inattendue, message neutre et reprise sans rechargement", async ({ page }) => {
    await page.route("https://**/*", route => route.abort());
    await page.goto(entry);
    await expect(page.locator("#root")).toBeVisible();
    await page.evaluate(() => {
      window.__errorTestMarker = "conservé";
      window.dispatchEvent(new ErrorEvent("error", { message: "SECRET_TOKEN <script>" }));
    });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading")).toHaveText("Loustic a trébuché…");
    await expect(dialog).not.toContainText("SECRET_TOKEN");
    await expect.poll(() => dialog.locator("img").evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    await dialog.getByRole("button", { name: "Réessayer", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => window.__errorTestMarker)).toBe("conservé");
    await page.evaluate(() => { Promise.reject(new Error("PRIVATE_BACKEND_DETAILS")); });
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).not.toContainText("PRIVATE_BACKEND_DETAILS");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("404 autonome : vrai statut, liens profonds et clavier sur mobile", async ({ page }) => {
  const oldBase = process.env.PAGES_BASE_PATH;
  let html;
  try {
    process.env.PAGES_BASE_PATH = "/EPS-calendar";
    await generateNotFound();
    html = await readFile("dist/404.html", "utf8");
  } finally {
    if (oldBase === undefined) delete process.env.PAGES_BASE_PATH; else process.env.PAGES_BASE_PATH = oldBase;
    await generateNotFound();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/*", route => route.fulfill({ status: 404, contentType: "text/html", body: html }));
  const response = await page.goto("https://example.invalid/EPS-calendar/absent/profond");
  expect(response.status()).toBe(404);
  await expect(page.getByRole("heading")).toHaveText("Loustic a perdu la piste…");
  const home = page.getByRole("link", { name: /Revenir à l’accueil/ });
  await expect(home).toHaveAttribute("href", "/EPS-calendar/");
  await page.keyboard.press("Tab");
  await expect(home).toBeFocused();
  expect(await page.locator("img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator(".lousticError")).toHaveCSS("border-top-width", "3px");
  await page.screenshot({ path: "test-results/loustic-404-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/loustic-404-desktop.png", fullPage: true });
});

 test("Démarrage interrompu : Loustic propose un rechargement confirmé", async ({ page }) => {
  await page.route("https://**/*", route => route.abort());
  await page.addInitScript(() => { Storage.prototype.getItem = () => { throw new Error("PRIVATE_STORAGE_ERROR"); }; });
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toHaveText("Loustic n’a pas pu démarrer");
  await expect(dialog).not.toContainText("PRIVATE_STORAGE_ERROR");
  page.once("dialog", prompt => prompt.dismiss());
  await dialog.getByRole("button", { name: "Recharger l’application" }).click();
  await expect(dialog).toBeVisible();
 });
