import { expect, test } from "@playwright/test";
import { openBookableClass, signIn, signUp, uniqueEmail } from "./helpers";

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
  // A-024/A-070: signed out, the class page says a trial exists and sends people to Create account (not Sign in).
  await page.context().clearCookies();
  await page.reload();
  await expect(page.getByText(/First time at Re·Form\? Your first .* class is €\d+ \(trial\)/)).toBeVisible();
  await expect(page.getByText("No password needed")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toHaveAttribute("href", /\/login\?next=/);
  await page.getByRole("link", { name: "Secure your spot" }).click();
  await expect(page).toHaveURL(/\/signup\?next=/);
  await signUp(page, uniqueEmail("nopack"), url);
  await expect(page.getByRole("button", { name: /Pay €/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Secure your package" })).toBeVisible();
  await expect(page.getByText(/14-day right of withdrawal doesn't apply \(EU Directive 2011\/83\/EU, art\. 16\(l\)\)/)).toBeVisible(); // A-012
  await page.getByText("Revolut", { exact: true }).click();
  await page.getByRole("button", { name: /Book your trial · €/ }).click();
  await expect(page.getByText("Booking confirmed")).toBeVisible();
  // A-029: the confirmation says what to pay, how, and the reference.
  await expect(page.getByRole("heading", { name: "To pay before class" })).toBeVisible();
  await expect(page.getByText(/Send €\d+ with Revolut/)).toBeVisible();
  await expect(page.getByText(/RF-[A-Z0-9]{6}/)).toBeVisible();
  await page.goto("/bookings");
  await expect(page.getByText("Awaiting payment")).toBeVisible();
  await expect(page.getByText(/Revolut ·/).first()).toBeVisible();
});
