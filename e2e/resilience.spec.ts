import { expect, test } from "@playwright/test";
import { openBookableClass, signIn } from "./helpers";

// A-020: a phone that loses the response after the booking went through.
test("a lost response while booking shows a calm notice, and the booking exists once", async ({ page }) => {
  await signIn(page, "elena@example.com", "/bookings");
  await expect(page.getByText("Reformer Package").first()).toBeVisible();
  await openBookableClass(page);
  const classUrl = page.url();
  // The server action runs, but its answer never reaches the page.
  let dropped = false;
  await page.route("**/book/**", async (route) => {
    if (route.request().method() !== "POST" || dropped) return route.continue();
    dropped = true;
    await route.fetch();
    await route.abort("connectionreset");
  });
  await page.getByRole("button", { name: /Secure your spot · 1 class/ }).click();
  await expect(page.getByText("We lost the connection. Check My classes before trying again.")).toBeVisible();
  await expect(page.getByText(/Application error/)).toHaveCount(0);
  await page.unroute("**/book/**");

  await page.goto(classUrl);
  await expect(page.getByText("You're booked").first()).toBeVisible();

  // Tidy up so the demo client's package is as it was.
  await page.goto("/bookings");
  await page.getByRole("button", { name: /^Cancel .*Pilates/ }).last().click();
  await page.getByRole("button", { name: "Yes, cancel" }).click();
  await expect(page.getByRole("group", { name: "Confirm cancellation" })).toHaveCount(0, { timeout: 15_000 });
});

test("an unknown address shows the studio's own not-found page", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "My classes" })).toBeVisible();
});
