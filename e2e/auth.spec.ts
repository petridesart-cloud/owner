import { expect, test } from "@playwright/test";
import { serviceDb, signIn, signUp, startSignUp, uniqueEmail } from "./helpers";

test("create an account, sign in with the password, reset a forgotten password", async ({ page }) => {
  const email = uniqueEmail("auth");
  await signUp(page, email, "/bookings");
  await expect(page).toHaveURL(/\/bookings/);

  // Sign out, then back in with the password (no email needed).
  await page.goto("/account");
  await page.getByRole("button", { name: /Sign out/ }).click();
  await expect(page).not.toHaveURL(/\/account/);
  await signIn(page, email, "/account", "wrong-password");
  await expect(page.getByText("Email or password isn't right.")).toBeVisible();
  await signIn(page, email, "/account", "test-pass-123");
  await expect(page).toHaveURL(/\/account/);

  // Forgot password: a code by email (on screen in the demo), then a new password.
  await page.getByRole("button", { name: /Sign out/ }).click();
  await expect(page).not.toHaveURL(/\/account/);
  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByLabel("Code from your email")).toHaveValue(/^\d{6,10}$/);
  await page.getByLabel("New password", { exact: true }).fill("new-pass-456");
  await page.getByLabel("Confirm new password").fill("new-pass-456");
  await page.getByRole("button", { name: "Save password and sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto("/account");
  await page.getByRole("button", { name: /Sign out/ }).click();
  await expect(page).not.toHaveURL(/\/account/);
  await signIn(page, email, "/account", "new-pass-456");
  await expect(page).toHaveURL(/\/account/);
});

test("under-18s can't create an account", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Date of birth").fill(`${new Date().getFullYear() - 16}-01-01`);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/18 or over/)).toBeVisible();
});

test("asking for a new code for an address with no account creates nothing and emails nothing (A-044)", async ({ page }) => {
  await startSignUp(page, uniqueEmail("resend"), "Resend", "test-pass-123");
  const stranger = uniqueEmail("stranger");
  await page.locator('input[type="hidden"][name="email"]').evaluate((el, v) => ((el as HTMLInputElement).value = v), stranger);
  await page.getByRole("button", { name: "Send a new code" }).click();
  await expect(page.getByRole("button", { name: "New code sent" })).toBeVisible(); // same reply either way
  const db = serviceDb();
  expect((await db.rpc("auth_user_by_email", { p_email: stranger })).data ?? []).toHaveLength(0);
  expect((await db.from("notifications").select("id").eq("recipient", stranger)).data ?? []).toHaveLength(0);
});
