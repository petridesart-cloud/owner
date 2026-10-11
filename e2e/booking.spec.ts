import { expect, test } from "@playwright/test";
import { completeWelcome, openBookableClass, signIn, uniqueEmail } from "./helpers";

test("new client books, pays, adds to calendar and cancels", async ({ page }) => {
  await openBookableClass(page);
  const bookUrl = new URL(page.url()).pathname;
  await page.getByRole("link", { name: "Secure your spot" }).click();
  await signIn(page, uniqueEmail("book"), bookUrl);
  await completeWelcome(page, "Eleni Test");

  await expect(page).toHaveURL(new RegExp(bookUrl));
  await expect(page.getByText("Total")).toBeVisible();
  await page.getByRole("button", { name: /^Pay €/ }).click();

  await expect(page.getByRole("heading", { name: /confirm & pay/i })).toBeVisible();
  await page.getByRole("button", { name: /Pay .*\(test\)/ }).click();

  await expect(page.getByText("Booking confirmed")).toBeVisible();
  await expect(page.getByRole("link", { name: /add to calendar/i })).toHaveAttribute("href", /\/api\/ics\//);

  await page.getByRole("link", { name: "My classes" }).last().click();
  await page.getByRole("button", { name: /^Cancel .*Pilates/ }).first().click();
  await page.getByRole("button", { name: "Yes, cancel" }).click();
  await expect(page.getByText("Nothing booked yet")).toBeVisible();
  // Card-paid early cancellation returns a reformer credit.
  await expect(page.getByText("reformer credits").locator("..").getByText("1", { exact: true })).toBeVisible();
});
