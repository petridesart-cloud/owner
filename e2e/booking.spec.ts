import { expect, test } from "@playwright/test";
import { openBookableClass, signIn, uniqueEmail, completeWelcome } from "./helpers";

test("returning client books with a package class, adds to calendar, cancels and gets it back", async ({ page }) => {
  await signIn(page, "elena@example.com", "/membership");
  await expect(page.getByText("reformer classes left")).toBeVisible();
  const before = Number(await page.locator("p.font-serif").first().textContent());

  await openBookableClass(page);
  await expect(page.getByText("What to bring")).toBeVisible();
  await expect(page.getByText(/VAT/)).toHaveCount(0);
  await page.getByRole("button", { name: /Secure your spot · 1 class/ }).click();
  await expect(page.getByText("Booking confirmed")).toBeVisible();
  await expect(page.getByRole("link", { name: /add to calendar/i })).toHaveAttribute("href", /\/api\/ics\//);

  await page.goto("/bookings");
  const cancel = page.getByRole("button", { name: /^Cancel .*Pilates/ }).last();
  await cancel.click();
  await page.getByRole("button", { name: "Yes, cancel" }).click();
  await expect(page.getByRole("button", { name: "Yes, cancel" })).toHaveCount(0);
  await page.goto("/membership");
  await expect(page.locator("p.font-serif").first()).toHaveText(String(before));
});

test("a new client without a package is asked to get one (pay in advance)", async ({ page }) => {
  await openBookableClass(page);
  const url = new URL(page.url()).pathname;
  await page.getByRole("link", { name: "Secure your spot" }).click();
  await signIn(page, uniqueEmail("nopack"), url);
  await completeWelcome(page);
  await expect(page.getByRole("button", { name: /Reserve|Pay €/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /monthly package or class pack|package/i }).first()).toBeVisible();
});
