import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import type { Database } from "../src/lib/supabase/types";

export const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;

/** Sign in with email + password (demo clients share the demo password). */
export async function signIn(page: Page, email: string, next = "/", password = "reform-demo") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** The studio signs in on the same page and lands in the studio. */
export async function adminSignIn(page: Page, email: string, password: string) {
  await signIn(page, email, "/", password);
  await expect(page).toHaveURL(/\/admin/);
}

/** Create an account (demo shows the email code on screen), then answer the health questions. */
export async function signUp(page: Page, email: string, next = "/", name = "Test Client") {
  await page.goto(`/signup?next=${encodeURIComponent(next)}`);
  const [first, ...rest] = name.split(" ");
  await page.getByLabel("Name", { exact: true }).fill(first);
  await page.getByLabel("Surname").fill(rest.join(" ") || "Client");
  await page.getByLabel("Date of birth").fill("1994-05-17");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mobile number").fill(`+357 9${Math.floor(1e6 + Math.random() * 8.9e6)}`); // unique: trials are matched by phone
  await page.getByLabel("Password", { exact: true }).fill("test-pass-123");
  await page.getByLabel("Confirm password").fill("test-pass-123");
  await page.locator("#policy").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByLabel("Code from your email")).toHaveValue(/^\d{6,10}$/);
  await page.getByRole("button", { name: "Confirm" }).click();
  // Then the health questions.
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
  const bookable = page.getByRole("link", { name: /^Book .*reformers? left/ }).filter({ visible: true });
  // From a few days ahead, the first day that has a reformer spot (some days, e.g. Sundays, have no classes).
  for (let i = 3; i < (await days.count()); i++) {
    await page.goto((await days.nth(i).getAttribute("href"))!);
    await page.waitForLoadState("networkidle");
    if (await bookable.count()) break;
  }
  await bookable.first().click();
  await page.waitForURL(/\/book\//);
  await expect(page.getByText("What to bring")).toBeVisible();
}

/** Service-role client for setting up test data (reads the local keys from .env.local). */
export function serviceDb() {
  const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1)]));
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/** Fill in "Create account" up to the code step (without confirming). */
export async function startSignUp(page: Page, email: string, first: string, password: string) {
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill(first);
  await page.getByLabel("Surname").fill("Client");
  await page.getByLabel("Date of birth").fill("1994-05-17");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mobile number").fill(`+357 9${Math.floor(1e6 + Math.random() * 8.9e6)}`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.locator("#policy").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByLabel("Code from your email")).toHaveValue(/^\d{6,10}$/);
}
