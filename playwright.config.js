import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

// 4173 reste le port par défaut ; PLAYWRIGHT_PORT permet de lancer la suite
// ailleurs quand une prévisualisation occupe déjà le port.
const port = process.env.PLAYWRIGHT_PORT || "4173";
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: process.env.PAGES_TEST
    ? [
        "**/pages.spec.js",
        "**/project-mapping.spec.js",
        "**/scroll.spec.js",
        "**/seo.spec.js",
        "**/theme.spec.js",
      ]
    : [
        "**/site.spec.js",
        "**/project-mapping.spec.js",
        "**/scroll.spec.js",
        "**/seo.spec.js",
        "**/theme.spec.js",
      ],
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: process.env.PAGES_TEST
      ? `${origin}/beton-decoratif-provence/`
      : origin,
    browserName: "chromium",
    launchOptions: { executablePath },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: process.env.PAGES_TEST
      ? `npm run preview -- --mode pages --port ${port} --strictPort`
      : `npm run preview -- --port ${port} --strictPort`,
    url: process.env.PAGES_TEST
      ? `${origin}/beton-decoratif-provence/`
      : origin,
    reuseExistingServer: false,
  },
});
