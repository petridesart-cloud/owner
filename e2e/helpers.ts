import { expect, type Page } from "@playwright/test";

export const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;

/** Sign in with the demo-mode on-screen code. */
export async function signIn(page: Page, email: string, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send my code" }).click();
  // Demo mode pre-fills the code.
  await expect(page.getByLabel("Code from your email")).toHaveValue(/^\d{6,10}$/);
  await page.getByRole("button", { name: "Continue" }).click();
}

export async function completeWelcome(page: Page, name = "Test Client") {
  await expect(page.getByRole("heading", { name: /a little about you/i })).toBeVisible();
  const [first, ...rest] = name.split(" ");
  await page.getByLabel("First name").fill(first);
  await page.getByLabel("Surname").fill(rest.join(" ") || "Client");
  await page.getByLabel("Mobile number").fill(`+357 9${Math.floor(1e6 + Math.random() * 8.9e6)}`); // unique: trials are matched by phone
  await page.getByLabel("Date of birth").fill("1994-05-17");
  await page.locator("#policy").check();
  await page.locator("#fitness").check();
  await page.getByRole("button", { name: "Continue" }).click();
  // Step 2: health questions.
  await page.waitForURL(/\/health/);
  await page.getByText("No injuries or medical conditions").click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator('label:has(input[name="bp_meds"][value="no"])').click();
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/health"));
}

/** Open the first bookable class on the schedule's later days. */
export async function openBookableClass(page: Page) {
  await page.goto("/schedule");
  const days = page.getByRole("navigation", { name: "Choose a day" }).getByRole("link");
  await days.nth(5).click();
  await page.getByRole("link", { name: /^Book .*reformers? left/ }).first().click();
  await page.waitForURL(/\/book\//);
  await expect(page.getByText("What to bring")).toBeVisible();
}
