import { expect, test } from "@playwright/test";
import { adminSignIn, signUp, uniqueEmail } from "./helpers";

const ADMIN = process.env.E2E_ADMIN_EMAIL ?? "studio@example.com";
const CODE = process.env.E2E_ADMIN_CODE ?? "24681357";

test("clients cannot open the studio admin", async ({ page }) => {
  await signUp(page, uniqueEmail("nosy"));
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);
});

test("the studio signs in with email + password and lands in the studio", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN);
  await page.getByLabel("Password").fill("11112222");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password isn't right.")).toBeVisible();
  await expect(page.getByText(/no email is sent/i)).toHaveCount(0);
  await adminSignIn(page, ADMIN, CODE);
  await page.getByRole("link", { name: "Classes" }).click();
  await expect(page.getByRole("heading", { name: "Classes" })).toBeVisible();
});
