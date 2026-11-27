import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

interface MenuIndex {
  categories?: Array<{ file?: string }>;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function mockRestaurantContent(): Promise<object> {
  const contentDirectory = join(
    process.cwd(),
    "src",
    "assets",
    "clients",
    "pizzeria-vesuvio",
  );
  const client = await readJson<Record<string, unknown>>(
    join(contentDirectory, "client.json"),
  );
  const allergens = await readJson<unknown[]>(
    join(contentDirectory, "allergens.json"),
  );
  const menuIndex = await readJson<MenuIndex>(
    join(contentDirectory, "menu", "index.json"),
  );
  const categoryFiles = Array.from(
    new Set(
      (menuIndex.categories ?? [])
        .map((category) => category.file)
        .filter((file): file is string => Boolean(file)),
    ),
  );
  const menuCategories = Object.fromEntries(
    await Promise.all(
      categoryFiles.map(async (file) => [
        file,
        await readJson(join(contentDirectory, "menu", file)),
      ]),
    ),
  );
  const reservations = client["reservations"] as
    Record<string, unknown> | undefined;

  return {
    client: {
      ...client,
      reservations: {
        ...reservations,
        enabled: true,
      },
    },
    allergens,
    menuIndex,
    menuCategories,
  };
}

test("reservation dialog is named, modal, keyboard closable, and restores focus", async ({
  page,
}) => {
  const restaurantContent = await mockRestaurantContent();
  await page.route("**/runtime-config.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'window.menuSmartQrRuntime = Object.freeze({ apiBaseUrl: "https://api.e2e.test" });',
    }),
  );
  await page.route(
    "https://api.e2e.test/api/v1/restaurants/pizzeria-vesuvio/content",
    (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(restaurantContent),
      }),
  );

  await page.goto("/");
  const openButton = page.getByRole("button", { name: "Prenota un tavolo" });
  await expect(openButton).toBeVisible();
  await openButton.click();

  const dialog = page.getByRole("dialog", { name: "Prenota un tavolo" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(openButton).toHaveAttribute("aria-expanded", "true");
  await expect(
    dialog.getByRole("heading", { name: "Prenota un tavolo" }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Chiudi" })).toBeFocused();

  const legalLinks = dialog.getByRole("link", { name: "Leggi" });
  await expect(legalLinks).toHaveCount(2);
  const legalPaths = [
    "/legal/demo-booking-terms.html",
    "/legal/demo-privacy-notice.html",
  ];
  for (const [index, path] of legalPaths.entries()) {
    const link = legalLinks.nth(index);
    await expect(link).toHaveAttribute("href", path);
    const documentPage = await page.context().newPage();
    const response = await documentPage.goto(path);
    expect(response?.status()).toBe(200);
    await expect(
      documentPage.getByText("Documento fittizio di collaudo.", { exact: false }),
    ).toBeVisible();
    await documentPage.close();
  }

  const lastFocusable = dialog
    .locator(
      'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    .last();
  await page.keyboard.press("Shift+Tab");
  await expect(lastFocusable).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(openButton).toBeFocused();
  await expect(openButton).toHaveAttribute("aria-expanded", "false");
});
