import { expect, type Page } from "@playwright/test";

export const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;

/** Sign in with the demo-mode on-screen code. */
export async function signIn(page: Page, email: string, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send my code" }).click();
  const notice = page.getByText(/your code is/i);
  await expect(notice).toBeVisible();
  const code = (await notice.textContent())!.match(/(\d{6})/)![1];
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Continue" }).click();
}

export async function completeWelcome(page: Page, name = "Test Client") {
  await expect(page.getByRole("heading", { name: /a little about you/i })).toBeVisible();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Mobile number").fill("+357 99 123456");
  await page.locator("#policy").check();
  await page.locator("#fitness").check();
  await page.getByRole("button", { name: "Continue" }).click();
}

/** Open the first bookable class on the schedule's later days. */
export async function openBookableClass(page: Page) {
  await page.goto("/schedule");
  const days = page.getByRole("navigation", { name: "Choose a day" }).getByRole("link");
  await days.nth(5).click();
  await page.getByRole("link", { name: /^Book .*reformers? left/ }).first().click();
  await page.waitForURL(/\/book\//);
  await expect(page.getByText(/Reformer class|Mat class|Special event/)).toBeVisible();
}
