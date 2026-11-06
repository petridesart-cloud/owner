import { expect, test, type Page } from "@playwright/test";
import { openBookableClass, serviceDb, signUp, startSignUp, uniqueEmail } from "./helpers";

// A-001 / A-105: health data is a real choice, never pre-ticked, and can be deleted.

async function profileId(email: string) {
  return (await serviceDb().from("profiles").select("id").eq("email", email).single()).data!.id;
}
async function answerBackPain(page: Page, alreadyTicked = false) {
  await page.goto("/health");
  await page.waitForLoadState("networkidle");
  if (alreadyTicked) await expect(page.locator('input[value="back"]')).toBeChecked();
  else await page.getByText("Back pain", { exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Tell us a little more").fill("Lower back ache after work");
  await page.locator('label:has(input[name="bp_meds"][value="no"])').click();
}

test("the in-person choice stores nothing and still reaches booking", async ({ page }) => {
  const email = uniqueEmail("inperson");
  await startSignUp(page, email, "Inperson", "test-pass-123");
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.waitForURL(/\/health/);
  await page.getByText("I'd rather tell my instructor in person").click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText(/Nothing is stored/)).toBeVisible();
  await expect(page.locator("#health_consent")).toHaveCount(0);
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/health"));

  const db = serviceDb();
  const id = await profileId(email);
  expect((await db.from("health_notes").select("profile_id").eq("profile_id", id)).data).toHaveLength(0);
  expect((await db.from("profiles").select("health_mode").eq("id", id).single()).data?.health_mode).toBe("in_person");

  await openBookableClass(page);
  await expect(page.getByText("One more step before booking")).toHaveCount(0);
});

test("a returning client sees an unticked box (then 'consented on'), and can delete their health information", async ({ page }) => {
  const email = uniqueEmail("healthdel");
  await signUp(page, email, "/account");
  await answerBackPain(page);
  const box = page.locator("#health_consent");
  await expect(box).toBeVisible();
  await expect(box).not.toBeChecked();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/we need your consent/)).toBeVisible();
  await box.check();
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/\/account/);

  // Next time the consent on file is shown, not a pre-ticked box.
  await answerBackPain(page, true);
  await expect(page.locator("#health_consent")).toHaveCount(0);
  await expect(page.getByText(/You consented to us keeping your health information/)).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/\/account/);

  const db = serviceDb();
  const id = await profileId(email);
  expect((await db.from("health_history").select("id").eq("profile_id", id)).data).toHaveLength(2);
  expect((await db.from("consents").select("id").eq("profile_id", id).eq("type", "health_data")).data).toHaveLength(1);

  await page.goto("/account");
  await page.getByText("Health", { exact: true }).click();
  await page.getByRole("button", { name: "Delete my health information" }).click();
  await expect(page.getByText("Your health information is deleted.")).toBeVisible();
  expect((await db.from("health_notes").select("profile_id").eq("profile_id", id)).data).toHaveLength(0);
  expect((await db.from("health_history").select("id").eq("profile_id", id)).data).toHaveLength(0);
  const last = (await db.from("consents").select("granted").eq("profile_id", id).eq("type", "health_data").order("id", { ascending: false }).limit(1).single()).data;
  expect(last?.granted).toBe(false);
  await page.getByText("Privacy & data").click();
  await expect(page.locator("li", { hasText: "Health data" })).toContainText("Withdrawn");
});

test("'No injuries' with only other medication asks for consent and saves (A-105)", async ({ page }) => {
  const email = uniqueEmail("healthmed");
  await signUp(page, email, "/account");
  await page.goto("/health");
  await page.waitForLoadState("networkidle");
  await expect(page.locator('input[name="none"]')).toBeChecked(); // their answer at sign-up
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator('label:has(input[name="bp_meds"][value="no"])').click();
  await expect(page.locator("#health_consent")).toHaveCount(0);
  await page.getByLabel(/Any other medication/).fill("Thyroxine");
  await expect(page.locator("#health_consent")).not.toBeChecked();
  await page.locator("#health_consent").check();
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/\/account/);
  const db = serviceDb();
  expect((await db.from("health_notes").select("medication").eq("profile_id", await profileId(email)).single()).data?.medication).toBe("Thyroxine");
});
