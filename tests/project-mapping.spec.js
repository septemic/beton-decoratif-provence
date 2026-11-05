import { test, expect } from "@playwright/test";

const base = process.env.PAGES_TEST ? "/beton-decoratif-provence/" : "/";

const cards = [
  {
    link: "Parlons de ma terrasse",
    finish: "Béton imprimé",
    amenagement: "Terrasse",
  },
  {
    link: "Préparer mon accès",
    finish: "Béton imprimé",
    amenagement: "Allée",
  },
  {
    link: "Aménager ma piscine",
    finish: "Béton imprimé",
    amenagement: "Plage de piscine",
  },
  {
    link: "Parlons de mon béton désactivé",
    finish: "Béton désactivé",
    amenagement: "",
  },
];

const finishField = (page) => page.locator("#project-type");
const amenagementField = (page) => page.locator("#project-amenagement");
const contextLine = (page) => page.locator("#project-context");

// Les ancres défilent en douceur : on remet la page en haut entre deux clics
// pour que chaque clic parte d'une position stable.
async function clickCard(page, name) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page
    .locator(".services-grid")
    .getByRole("link", { name, exact: true })
    .click();
}

async function expectProject(page, finish, amenagement) {
  await expect(finishField(page)).toHaveValue(finish);
  await expect(amenagementField(page)).toHaveValue(amenagement);
  await expect(contextLine(page)).toHaveText(
    amenagement ? `Votre projet : ${amenagement}` : "",
  );
  if (amenagement) {
    await expect(contextLine(page)).toBeVisible();
  } else {
    await expect(contextLine(page)).toBeHidden();
  }
}

test("each card selects its finish and amenagement on a fresh page", async ({
  page,
}) => {
  for (const card of cards) {
    await page.goto(base);
    await clickCard(page, card.link);
    await expectProject(page, card.finish, card.amenagement);
  }
});

test("a second card click replaces the finish without reloading the page", async ({
  page,
}) => {
  await page.goto(base);

  await clickCard(page, "Parlons de ma terrasse");
  await expectProject(page, "Béton imprimé", "Terrasse");

  await clickCard(page, "Parlons de mon béton désactivé");
  await expectProject(page, "Béton désactivé", "");

  // Le retour vers une carte avec aménagement doit aussi repasser.
  await clickCard(page, "Parlons de ma terrasse");
  await expectProject(page, "Béton imprimé", "Terrasse");
});

test("a manual select choice is replaced by the next card click", async ({
  page,
}) => {
  await page.goto(base);
  await finishField(page).selectOption("Dalle béton brut");
  await expect(finishField(page)).toHaveValue("Dalle béton brut");

  await clickCard(page, "Parlons de ma terrasse");
  await expectProject(page, "Béton imprimé", "Terrasse");
});

test("?projet= fills the finish and the amenagement of an empty form", async ({
  page,
}) => {
  await page.goto(`${base}?projet=piscine#contact`);
  await expectProject(page, "Béton imprimé", "Plage de piscine");
});
