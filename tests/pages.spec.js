import { test, expect } from "@playwright/test";

test("the project path loads all local assets and preserves the home link", async ({ page }) => {
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Le béton imprimé.");
  await expect(page.locator(".hero-art img")).toBeVisible();
  expect(await page.locator(".hero-art img").evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("./merci/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Parlons de");
  await expect(page.getByText("Votre demande a été transmise.", { exact: false })).toHaveCount(0);
  await page.getByRole("link", { name: "Revenir au site" }).click();
  await expect(page).toHaveURL(/\/beton-decoratif-provence\/$/);
  expect(failures).toEqual([]);
});

test("a quote prepares an email with the selected finish without claiming delivery", async ({ page }) => {
  let posts = 0;
  page.on("request", (request) => { if (request.method() === "POST") posts += 1; });
  await page.goto("./");
  await page.getByRole("button", { name: /Sable Doux/ }).click();
  await page.getByRole("button", { name: "Choisir cette inspiration" }).click();
  await page.getByLabel("Votre nom").fill("Camille Test");
  await page.getByLabel("Votre e-mail").fill("camille@example.test");
  await page.getByLabel("Votre ville").fill("Aix-en-Provence");
  await page.getByLabel("Type de projet").selectOption("Béton imprimé");
  await page.getByLabel("Parlez-nous de votre projet").fill("Une rénovation de la terrasse de 35 mètres carrés.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Préparer mon e-mail" }).click();
  const draft = page.getByRole("link", { name: "Ouvrir ma messagerie" });
  await expect(draft).toBeVisible();
  const href = await draft.getAttribute("href");
  const url = new URL(href);
  expect(url.pathname).toBe("contact@betondecoratifprovence.fr");
  expect(url.searchParams.get("subject")).toContain("Béton imprimé");
  expect(url.searchParams.get("body")).toContain("camille@example.test");
  expect(url.searchParams.get("body")).toContain("Nuance : Sable");
  expect(url.searchParams.get("body")).toContain("terrasse de 35");
  await expect(page.getByRole("status").filter({ hasText: "Votre e-mail est prêt" })).toBeVisible();
  await expect(page).toHaveURL(/\/beton-decoratif-provence\/$/);
  expect(posts).toBe(0);
});

test("an incomplete email request stays in the form", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Préparer mon e-mail" }).click();
  await expect(page.locator('[name="nom"]')).toBeFocused();
  await expect(page.getByRole("link", { name: "Ouvrir ma messagerie" })).toBeHidden();
});
