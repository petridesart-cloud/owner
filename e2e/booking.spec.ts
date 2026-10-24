import { expect, test } from "@playwright/test";
import { openBookableClass, signIn, uniqueEmail, completeWelcome } from "./helpers";

test("returning client books with a package class, adds to calendar, cancels and gets it back", async ({ page }) => {
  await signIn(page, "elena@example.com", "/bookings");
  const left = page.locator('a[href^="/bookings/package/"] [data-left]').first();
  await expect(page.getByText("Reformer Package").first()).toBeVisible();
  const before = Number(await left.textContent());

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
  await expect(page.getByRole("group", { name: "Confirm cancellation" })).toHaveCount(0, { timeout: 15_000 });
  await page.goto("/bookings");
  await expect(left).toHaveText(String(before));
});

test("a new client without a package can book a trial (pay by Revolut) or get a package", async ({ page }) => {
  await openBookableClass(page);
  const url = new URL(page.url()).pathname;
  await page.getByRole("link", { name: "Secure your spot" }).click();
  await signIn(page, uniqueEmail("nopack"), url);
  await completeWelcome(page);
  await expect(page.getByRole("button", { name: /Pay €/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Secure your package" })).toBeVisible();
  await page.getByText("Revolut", { exact: true }).click();
  await page.getByRole("button", { name: /Book your trial · €/ }).click();
  await expect(page.getByText("Booking confirmed")).toBeVisible();
  await page.goto("/bookings");
  await expect(page.getByText("Awaiting payment")).toBeVisible();
  await expect(page.getByText(/Revolut ·/).first()).toBeVisible();
});
