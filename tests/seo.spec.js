import { test, expect } from "@playwright/test";
const origin = "https://betondecoratifprovence.fr";
const services = [
  ["terrasse-beton-imprime", "Terrasse en béton imprimé", "Béton imprimé", "Terrasse"],
  ["allee-beton-imprime", "Allée en béton imprimé", "Béton imprimé", "Allée"],
  ["plage-piscine-beton-imprime", "Plage de piscine en béton imprimé", "Béton imprimé", "Plage de piscine"],
  ["beton-desactive", "Béton désactivé", "Béton désactivé", ""],
];
const base = process.env.PAGES_TEST ? "/beton-decoratif-provence/" : "/";

test("each service is a real crawlable page with its own metadata, schema, photo and links", async ({ page }) => {
  const failures = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("response", response => { if (response.status() >= 400) failures.push(response.url()); });
  const titles = new Set();
  for (const [slug, name] of services) {
    const response = await page.goto(`${base}${slug}/`);
    expect(response.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toContainText(name + " en Provence");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${origin}/${slug}/`);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `${origin}/${slug}/`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index, follow/);
    const title = await page.title();
    expect(titles.has(title)).toBe(false);
    titles.add(title);
    const graph = await page.locator('script[type="application/ld+json"]').evaluate(element => JSON.parse(element.textContent)["@graph"]);
    const service = graph.find(item => item["@type"] === "Service");
    const organization = graph.find(item => item["@id"] === `${origin}/#entreprise`);
    expect(service.name).toBe(name);
    expect(service.url).toBe(`${origin}/${slug}/`);
    expect(service.provider["@id"]).toBe(organization["@id"]);
    expect(organization.telephone).toBe("+33754253693");
    expect(organization.email).toBe("contact@betondecoratifprovence.fr");
    expect(organization["@type"]).toBe("HomeAndConstructionBusiness");
    expect(organization.legalName).toBe("BETON IMPRIME PROVENCE");
    expect(organization.identifier.value).toBe("95361735400014");
    expect(organization.address.addressLocality).toBe("Cuges-les-Pins");
    await expect(page.locator(".business-identity")).toContainText("95361735400014");
    expect(JSON.stringify(graph)).not.toMatch(/AggregateRating|reviewCount|priceRange/);
    expect(graph.find(item => item["@type"] === "BreadcrumbList").itemListElement[1].item).toBe(service.url);
    const photo = page.locator(".landing-photo img");
    await expect(photo).toBeVisible();
    expect(await photo.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("navigation", { name: "Nos solutions en béton" }).getByRole("link")).toHaveCount(4);
    await expect(page.locator(".breadcrumb a")).toHaveAttribute("href", base);
  }
  expect(failures).toEqual([]);
});

test("service navigation stays accessible on desktop and mobile", async ({ page }, testInfo) => {
  await page.goto(`${base}allee-beton-imprime/`);
  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  if (testInfo.project.name === "mobile") {
    const toggle = page.getByRole("button", { name: "Ouvrir le menu" });
    await toggle.click();
    await expect(navigation).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(navigation).not.toBeVisible();
    await expect(toggle).toBeFocused();
    await toggle.click();
  }
  await navigation.getByRole("link", { name: "Nos solutions" }).click();
  await expect(page).toHaveURL(new RegExp(`${base}#services$`));
  await expect(page.locator("#services")).toBeInViewport();
});

test("each service quotation action selects the correct project on the home form", async ({ page }) => {
  for (const [slug, , project, amenagement] of services) {
    await page.goto(`${base}${slug}/`);
    await page.getByRole("link", { name: /Demander mon devis gratuit/ }).click();
    await expect(page).toHaveURL(/\?projet=[a-z]+#contact$/);
    await expect(page.locator("#project-type")).toHaveValue(project);
    await expect(page.locator("#project-amenagement")).toHaveValue(amenagement);
    await expect(page.getByLabel("Votre nom")).toBeInViewport();
  }
  await page.goto(`${base}?projet=inconnu#contact`);
  await expect(page.locator("#project-type")).toHaveValue("");
  await expect(page.locator("#project-amenagement")).toHaveValue("");
});

test("optional telephone and surface are preserved in the quote flow on each host", async ({ page }) => {
  let submitted;
  await page.route("**/*", async route => {
    if (route.request().method() !== "POST") return route.continue();
    submitted = new URLSearchParams(route.request().postData());
    await route.fulfill({ status: 200, contentType: "text/plain", body: "Accepted" });
  });
  await page.goto(`${base}?projet=terrasse#contact`);
  await page.getByLabel("Votre nom").fill("Camille Test");
  await page.getByLabel("Votre e-mail").fill("camille@example.test");
  await page.getByLabel("Votre téléphone").fill("06 00 00 00 00");
  await page.getByLabel("Surface approximative en m²").fill("35");
  await page.getByLabel("Parlez-nous de votre projet").fill("Terrasse 35m²");
  await page.getByRole("checkbox").check();
  if (process.env.PAGES_TEST) {
    await page.getByRole("button", { name: "Préparer mon e-mail" }).click();
    const email = new URL(await page.getByRole("link", { name: "Ouvrir ma messagerie" }).getAttribute("href"));
    expect(email.searchParams.get("body")).toContain("Téléphone : 06 00 00 00 00");
    expect(email.searchParams.get("body")).toContain("Surface approximative (m²) : 35");
    expect(submitted).toBeUndefined();
  } else {
    await page.getByRole("button", { name: "Envoyer ma demande" }).click();
    await expect(page).toHaveURL(/\/merci\/$/);
    expect(submitted.get("telephone")).toBe("06 00 00 00 00");
    expect(submitted.get("surface")).toBe("35");
    expect(submitted.get("message")).toBe("Terrasse 35m²");
    expect(submitted.get("projet")).toBe("Béton imprimé");
    expect(submitted.get("amenagement")).toBe("Terrasse");
  }
});

test("service content, FAQs and cross-page navigation work without JavaScript", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: testInfo.project.use.baseURL, viewport: testInfo.project.use.viewport });
  const page = await context.newPage();
  try {
    await page.goto(`${base}terrasse-beton-imprime/`);
    await expect(page.locator("h1")).toContainText("Terrasse en béton imprimé");
    const words = (await page.locator(".article-copy").innerText()).trim().split(/\s+/).length;
    expect(words).toBeGreaterThan(350);
    await expect(page.locator("h1")).toHaveCSS("font-family", /Manrope/);
    const question = page.locator(".faq-list details").first();
    await question.locator("summary").click();
    await expect(question.locator("p")).toBeVisible();
    await page.getByRole("navigation", { name: "Nos solutions en béton" }).getByRole("link", { name: "Béton désactivé", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${base}beton-desactive/$`));
    await expect(page.locator("h1")).toContainText("Béton désactivé en Provence");
  } finally { await context.close(); }
});

test("crawl map, sharing metadata and excluded utility pages match the public site", async ({ page, request }) => {
  const sitemap = await request.get(`${base}sitemap.xml`);
  expect(sitemap.status()).toBe(200);
  const locations = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  expect(locations.sort()).toEqual([`${origin}/`, ...services.map(([slug]) => `${origin}/${slug}/`)].sort());
  expect(await (await request.get(`${base}robots.txt`)).text()).toContain(`Sitemap: ${origin}/sitemap.xml`);
  await page.goto(base);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(image).toBe(`${origin}/images/partage-beton-provence.jpg`);
  const jpeg = await request.get(`${base}images/partage-beton-provence.jpg`);
  expect(jpeg.status()).toBe(200);
  expect((await jpeg.body()).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  for (const utility of ["confidentialite/", "mentions-legales/", "404.html"]) {
    await page.goto(base + utility);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator("h1")).toHaveCount(1);
    if (utility === "mentions-legales/") await expect(page.locator("main")).toContainText("953 617 354 00014");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(page.getByRole("link", { name: /Revenir à l’accueil/ })).toHaveAttribute("href", base);
});
