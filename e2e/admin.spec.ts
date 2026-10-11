import { expect, test } from "@playwright/test";
import { completeWelcome, signIn, uniqueEmail } from "./helpers";

const ADMIN = process.env.E2E_ADMIN_EMAIL ?? "studio@example.com";
const CODE = process.env.E2E_ADMIN_CODE ?? "24681357";

test("clients cannot open the studio admin", async ({ page }) => {
  await signIn(page, uniqueEmail("nosy"));
  await completeWelcome(page);
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);
});

test("admin signs in with the demo admin code, not an on-screen code", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN);
  await page.getByRole("button", { name: "Send my code" }).click();
  await expect(page.getByText(/your code is/i)).toHaveCount(0);
  await page.getByLabel("Admin code").fill("11112222");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That admin code isn't right.")).toBeVisible();
  await page.getByLabel("Admin code").fill(CODE);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/admin/);
  await page.getByRole("link", { name: "Classes" }).click();
  await expect(page.getByRole("heading", { name: "Classes" })).toBeVisible();
});
