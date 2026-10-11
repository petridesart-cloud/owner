import { expect, test } from "@playwright/test";
import { completeWelcome, openBookableClass, signIn, uniqueEmail } from "./helpers";

test("new client reserves to pay at the studio, adds to calendar and cancels", async ({ page }) => {
  await openBookableClass(page);
  const bookUrl = new URL(page.url()).pathname;
  await page.getByRole("link", { name: "Secure your spot" }).click();
  await signIn(page, uniqueEmail("book"), bookUrl);
  await completeWelcome(page, "Eleni Test");

  await expect(page).toHaveURL(new RegExp(bookUrl));
  await expect(page.getByText("Single class")).toBeVisible();
  await expect(page.getByText(/VAT/)).toHaveCount(0);
  await page.getByRole("button", { name: /Reserve · pay .* at the studio/ }).click();

  await expect(page.getByText("Booking confirmed")).toBeVisible();
  await expect(page.getByRole("link", { name: /add to calendar/i })).toHaveAttribute("href", /\/api\/ics\//);

  await page.getByRole("link", { name: "My classes" }).last().click();
  await page.getByRole("button", { name: /^Cancel .*Pilates/ }).first().click();
  await page.getByRole("button", { name: "Yes, cancel" }).click();
  await expect(page.getByText("Nothing booked yet")).toBeVisible();
});
