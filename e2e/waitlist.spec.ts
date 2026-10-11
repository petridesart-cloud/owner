import { expect, test } from "@playwright/test";
import { completeWelcome, signIn, uniqueEmail } from "./helpers";

test("full class offers the waitlist", async ({ page }) => {
  await page.goto("/schedule");
  const days = page.getByRole("navigation", { name: "Choose a day" }).getByRole("link");
  const n = await days.count();
  for (let i = 0; i < n; i++) {
    const href = await days.nth(i).getAttribute("href");
    await page.goto(href!);
    if (await page.getByRole("link", { name: /^Join waitlist for/ }).count()) break;
  }
  const full = page.getByRole("link", { name: /^Join waitlist for/ }).first();
  await full.click();
  await page.waitForURL(/\/book\//);
  const url = new URL(page.url()).pathname;
  await page.getByRole("link", { name: "Secure your spot" }).click();
  await signIn(page, uniqueEmail("wait"), url);
  await completeWelcome(page);
  await page.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(page.getByText(/on the waitlist/)).toBeVisible();
  await page.getByRole("button", { name: "Leave waitlist" }).click();
  await expect(page.getByRole("button", { name: "Join the waitlist" })).toBeVisible();
});
