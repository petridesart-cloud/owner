import { expect, test } from "@playwright/test";
import { serviceDb, signUp, uniqueEmail } from "./helpers";

test("A-013, A-104: final legal pages, one tap from the footer's Terms & policies, with their version", async ({ page }) => {
  for (const [name, path, heading] of [
    ["Privacy", "/legal/privacy", "Privacy Policy"],
    ["Cookies", "/legal/cookies", "Cookies Policy"],
    ["Health & Safety", "/legal/health", "Health & Safety acknowledgement"],
    ["Accessibility", "/legal/accessibility", "Accessibility statement"],
    ["Terms", "/legal/terms", "Terms & Conditions"],
  ] as const) {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Terms & policies" }).click();
    await expect(page).toHaveURL("/legal");
    await page.getByRole("main").getByRole("link", { name: name === "Terms" ? "Terms & Conditions" : name, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByText(/draft placeholder/i)).toHaveCount(0);
    if (path !== "/legal/accessibility") await expect(page.getByText(/^Version \d+ · last updated/)).toBeVisible();
  }
  await page.goto("/legal/cookies");
  await expect(page.getByText(/Up to 400 days/)).toBeVisible();
  await page.goto("/legal/privacy");
  await expect(page.getByRole("cell", { name: /Health answers and their history/ }).first()).toBeVisible();
  await page.goto("/legal/cancellation");
  await expect(page).toHaveURL(/\/policy\/payments$/);
});

test("A-009, A-060: sign-up records each accepted document at its version, and no fitness declaration", async ({ page }) => {
  const email = uniqueEmail("legal");
  await signUp(page, email);
  const db = serviceDb();
  const { data: p } = await db.from("profiles").select("id").eq("email", email).single();
  const { data: rows } = await db.from("consents").select("type, doc_version_id, policy_versions(doc, version)").eq("profile_id", p!.id);
  const accepted = (rows ?? []).filter((r) => r.doc_version_id).map((r) => r.type).sort();
  expect(accepted).toEqual(["payments_policy", "studio_rules", "terms", "waiver"]);
  expect((rows ?? []).some((r) => r.type === "fitness_declaration")).toBe(false);
  await page.goto("/account");
  await page.getByText("Privacy & data").click();
  await expect(page.getByText("Health & Safety acknowledgement")).toBeVisible();
  await expect(page.getByText(/Accepted · .* \(version \d+\)/).first()).toBeVisible();
});

// Her notes (8 Nov): reading the terms from Create account keeps what was typed (even with the phone's Back
// button), and a new client's first Home says "Welcome, name", then "Welcome back, name".
test("terms open on the same page without losing the form; first Home says Welcome, then Welcome back", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill("Nora");
  await page.getByLabel("Email").fill("nora@example.org");
  await page.getByLabel("Password", { exact: true }).fill("keep-this-123");
  await page.getByRole("button", { name: "terms and policies" }).click();
  const sheet = page.getByRole("dialog", { name: "Terms and policies" });
  await expect(sheet.getByRole("heading", { name: "Terms & Conditions" })).toBeVisible();
  await page.goBack(); // the phone's Back button closes the sheet, not the form
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/signup/);
  await page.getByRole("button", { name: "terms and policies" }).click();
  await sheet.getByRole("button", { name: "Back to the form" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Nora");
  await expect(page.getByLabel("Email")).toHaveValue("nora@example.org");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("keep-this-123");

  await signUp(page, uniqueEmail("greet"), "/", "Greta Green"); // lands on Home after the health questions
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Welcome, Greta" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome back, Greta" })).toBeVisible();
});
