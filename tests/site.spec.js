import { test, expect } from "@playwright/test";

test("the production page loads its assets without browser errors", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Le béton imprimé.",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator(".hero-art img")).toBeVisible();
  expect(
    await page
      .locator(".hero-art img")
      .evaluate((image) => image.complete && image.naturalWidth > 0),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByRole("button", { name: /Sable Doux/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("homepage.png") });
  expect(errors).toEqual([]);
});

test("filters display the correct finishes and can restore the full palette", async ({
  page,
}) => {
  await page.goto("/");
  const cards = page.locator(".material-card:visible");
  await expect(cards).toHaveCount(6);
  await page.getByRole("button", { name: "Tons chaleureux" }).click();
  await expect(cards).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Tons chaleureux" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toContainText(["Sable", "Argile", "Terre cuite"]);
  await page.getByRole("button", { name: "Tons minéraux" }).click();
  await expect(cards).toContainText(["Greige", "Craie", "Graphite"]);
  await page.getByRole("button", { name: /Toutes les nuances/ }).click();
  await expect(cards).toHaveCount(6);
});

test("a finish opens in an accessible dialog and becomes part of the quote request", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: /Sable Doux/ });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Sable" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("button", { name: "Choisir cette inspiration" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator('[name="nuance"]')).toHaveValue("Sable");
  await expect(page.locator("#project-message")).toHaveValue(/nuance Sable/);
  await expect(page.locator("#project-type")).toHaveValue("À définir ensemble");
  await expect(page.locator("#project-message")).toBeFocused();
  await page
    .locator("#project-message")
    .fill("Mon message déjà écrit pour un projet personnel.");
  await page.getByRole("button", { name: /Greige Calme/ }).click();
  await page.getByRole("button", { name: "Choisir cette inspiration" }).click();
  await expect(page.locator('[name="nuance"]')).toHaveValue("Greige");
  await expect(page.locator("#project-message")).toHaveValue(
    "Mon message déjà écrit pour un projet personnel.",
  );
});

test("navigation, service selection and frequently asked questions work", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    await expect(
      page.getByRole("navigation", { name: "Navigation principale" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("navigation", { name: "Navigation principale" }),
    ).not.toBeVisible();
    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  }
  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: /Votre projet/ })
    .click();
  await expect(page).toHaveURL(/#contact$/);
  const quickActions = page.getByRole("navigation", {
    name: "Actions rapides",
  });
  if (testInfo.project.name === "mobile") {
    await expect(
      page.getByRole("navigation", { name: "Navigation principale" }),
    ).not.toBeVisible();
    await expect(quickActions).toBeVisible();
    await expect(
      quickActions.getByRole("link", { name: /Écrire sur WhatsApp/ }),
    ).toHaveAttribute("href", "https://wa.me/message/I7RZCIKHK42VP1");
    await quickActions.getByRole("link", { name: "Demander un devis" }).click();
    await expect(page).toHaveURL(/#contact$/);
  } else {
    await expect(quickActions).not.toBeVisible();
  }
  await page.getByRole("link", { name: /Aménager ma piscine/ }).click();
  await expect(page.locator("#project-type")).toHaveValue("Béton imprimé");
  await expect(page.locator("#project-amenagement")).toHaveValue(
    "Plage de piscine",
  );
  await page
    .getByText("Peut-on réaliser une allée carrossable ?", { exact: false })
    .click();
  await expect(
    page.getByText("Le projet doit être dimensionné pour les véhicules prévus.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Confidentialité", exact: true })
    .first()
    .click();
  await expect(page.locator("#confidentialite")).toHaveAttribute("open", "");
});

async function fillRequest(page) {
  await page.getByLabel("Votre nom").fill("Camille Test");
  await page.getByLabel("Votre e-mail").fill("camille@example.test");
  await page.getByLabel("Votre ville").fill("Aix-en-Provence");
  await page.getByLabel("Type de projet").selectOption("Béton imprimé");
  await page
    .getByLabel("Parlez-nous de votre projet")
    .fill("Un projet de béton imprimé pour une terrasse de 35 mètres carrés.");
  await page.getByRole("checkbox").check();
}

test("a valid request sends the Netlify fields and reaches the confirmation page", async ({
  page,
}) => {
  let submitted;
  await page.route("**/*", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submitted = new URLSearchParams(route.request().postData());
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "Accepted",
    });
  });
  await page.goto("/");
  await fillRequest(page);
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(page).toHaveURL(/\/merci\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Merci pour",
  );
  expect(submitted.get("form-name")).toBe("devis");
  expect(submitted.get("email")).toBe("camille@example.test");
  expect(submitted.get("projet")).toBe("Béton imprimé");
  expect(submitted.get("amenagement")).toBe("");
  expect(submitted.get("consentement")).toBe("oui");
  expect(submitted.get("bot-field")).toBe("");
  await page.getByRole("link", { name: "Revenir au site" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Le béton imprimé.",
  );
});

test("a failed submission preserves the request and allows a retry", async ({
  page,
}) => {
  await page.route("**/*", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 503, body: "Unavailable" });
  });
  await page.goto("/");
  await fillRequest(page);
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Votre demande n’a pas pu être envoyée.",
  );
  await expect(page.getByLabel("Votre e-mail")).toHaveValue(
    "camille@example.test",
  );
  await expect(page.getByLabel("Parlez-nous de votre projet")).toHaveValue(
    /terrasse de 35/,
  );
  await expect(
    page.getByRole("button", { name: "Envoyer ma demande" }),
  ).toBeEnabled();
  await expect(page.locator("#project-form")).not.toHaveAttribute("aria-busy");
});

test("required fields prevent an empty request from being sent", async ({
  page,
}) => {
  let requestCount = 0;
  page.on("request", (request) => {
    if (request.method() === "POST") requestCount += 1;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(page.locator('[name="nom"]')).toBeFocused();
  await expect(page.locator('[name="nom"]:invalid')).toHaveCount(1);
  expect(requestCount).toBe(0);
});

test("the layout fits a narrow screen with reduced motion enabled", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /Sable Doux/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Choisir cette inspiration" }).click();
  await expect(page.locator("#project-message")).toBeInViewport();
});

test("the optimized page remains styled and usable without JavaScript", async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: testInfo.project.use.baseURL,
    viewport: testInfo.project.use.viewport,
  });
  const page = await context.newPage();
  const failures = [];
  page.on("response", response => {
    if (response.status() >= 400) failures.push(response.url());
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-family", /Manrope/);
  await expect(page.locator(".hero-art img")).toBeVisible();
  expect(await page.locator(".hero-art img").evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.getByRole("link", { name: /Demander mon devis gratuit/ }).click();
  await expect(page).toHaveURL(/#contact$/);
  await expect(page.getByLabel("Votre nom")).toBeVisible();
  await expect(page.locator("#project-form")).toHaveAttribute("method", "POST");
  await expect(page.locator("#project-form")).toHaveAttribute("action", "/merci/");
  expect(failures).toEqual([]);
  await context.close();
});
