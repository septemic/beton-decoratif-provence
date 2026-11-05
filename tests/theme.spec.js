import { test, expect } from "@playwright/test";
const base = process.env.PAGES_TEST ? "/beton-decoratif-provence/" : "/";
const key = "bdp-theme";
const ready = page => expect(page.locator("html")).toHaveAttribute("data-theme-ready", "true");
const toggle = page => page.getByRole("button", { name: "Mode sombre", exact: true });

test("system preference is live until the visitor makes a persistent explicit choice", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(base);
  await ready(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(22, 25, 29)");
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await toggle(page).click();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe("dark");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await ready(page);
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  await toggle(page).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await ready(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.evaluate(key => localStorage.setItem(key, "invalid-theme"), key);
  await page.reload();
  await ready(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("keyboard toggle, photographs, swatches and header remain correct at narrow and intermediate widths", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(base);
  await ready(page);
  const swatch = await page.locator(".material-card .swatch").first().evaluate(el => getComputedStyle(el).backgroundImage);
  const control = toggle(page);
  await control.focus();
  await page.keyboard.press("Space");
  await expect(control).toBeFocused();
  await expect(control).toHaveAttribute("aria-pressed", "true");
  await expect(control).toHaveAttribute("title", "Activer le mode clair");
  await expect(page.locator(".service-card").first()).toHaveCSS("background-color", "rgb(27, 34, 43)");
  expect(await page.locator(".material-card .swatch").first().evaluate(el => getComputedStyle(el).backgroundImage)).toBe(swatch);
  await expect(page.locator(".hero-art img")).toHaveCSS("filter", "none");
  await page.keyboard.press("Enter");
  await expect(control).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  for (const width of [320, 390, 800, 801, 820, 900, 1024, 1100, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(control).toBeInViewport();
    const box = await control.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("the selected theme is available on every static page and after history navigation", async ({ page }) => {
  await page.goto(base);
  await ready(page);
  await toggle(page).click();
  for (const route of ["terrasse-beton-imprime/", "allee-beton-imprime/", "plage-piscine-beton-imprime/", "beton-desactive/", "mentions-legales/", "confidentialite/", "merci/", "404.html"]) {
    await page.goto(base + route);
    await ready(page);
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(22, 25, 29)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await toggle(page).click();
  await page.goBack();
  await ready(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("other tabs synchronize preferences and storage clearing restores the system choice", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(base);
  await ready(page);
  const other = await context.newPage();
  try {
    await other.emulateMedia({ colorScheme: "light" });
    await other.goto(base + "terrasse-beton-imprime/");
    await ready(other);
    await toggle(page).click();
    await expect(toggle(other)).toHaveAttribute("aria-pressed", "true");
    await toggle(other).click();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    await other.evaluate(key => localStorage.removeItem(key), key);
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    await page.evaluate(() => localStorage.clear());
    await expect(toggle(other)).toHaveAttribute("aria-pressed", "false");
  } finally { await other.close(); }
});

test("blocked browser storage still allows changing themes without page errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage blocked", "SecurityError"); } });
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(base);
  await ready(page);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("a saved dark theme renders before delayed application JavaScript and enables the control when ready", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(key => localStorage.setItem(key, "dark"), key);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route("**/assets/*.js", async route => { await gate; await route.continue(); });
  try {
    await page.goto(base, { waitUntil: "commit" });
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(22, 25, 29)");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator(".theme-toggle")).toBeDisabled();
    await expect(page.locator(".theme-toggle")).not.toBeVisible();
  } finally { release(); }
  await page.waitForLoadState("load");
  await ready(page);
  await expect(toggle(page)).toBeVisible();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
});

test("motion preferences and JavaScript-free system theme remain usable", async ({ page, browser }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto(base);
  await ready(page);
  await toggle(page).click();
  await expect(page.locator(".theme-icon-sun")).toHaveCSS("transition-duration", "0s");
  expect(await toggle(page).evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: "dark", baseURL: testInfo.project.use.baseURL, viewport: testInfo.project.use.viewport });
  const nativePage = await context.newPage();
  try {
    await nativePage.goto(base + "terrasse-beton-imprime/");
    await expect(nativePage.locator("body")).toHaveCSS("background-color", "rgb(22, 25, 29)");
    await expect(nativePage.locator(".theme-toggle")).not.toBeVisible();
    await expect(nativePage.locator("h1")).toHaveCSS("font-family", /Manrope/);
    await nativePage.locator(".faq-list summary").first().click();
    await expect(nativePage.locator(".faq-list details").first()).toHaveAttribute("open", "");
    await nativePage.locator(".breadcrumb a").click();
    await expect(nativePage.locator("h1")).toContainText("Le béton imprimé.");
  } finally { await context.close(); }
});

test("the theme adds no idle animation loop, network request or layout shift when toggled", async ({ page }) => {
  await page.addInitScript(() => {
    window.themeRafCalls = 0;
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => { window.themeRafCalls++; return raf.call(window, callback); };
  });
  await page.goto(base);
  await ready(page);
  await page.waitForLoadState("networkidle");
  const requests = [];
  page.on("request", request => requests.push(request.url()));
  await page.evaluate(() => {
    window.themeLayoutShift = 0;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.themeLayoutShift += entry.value;
    }).observe({ type: "layout-shift" });
  });
  const before = await page.evaluate(() => window.themeRafCalls);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(450);
  expect(await page.evaluate(() => window.themeRafCalls)).toBe(before);
  expect(await page.evaluate(() => window.themeLayoutShift)).toBe(0);
  expect(requests).toEqual([]);
});
