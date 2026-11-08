import { expect, test } from "@playwright/test";
import { adminSignIn, serviceDb, signUp, uniqueEmail } from "./helpers";

const ADMIN = process.env.E2E_ADMIN_EMAIL ?? "studio@example.com";
const CODE = process.env.E2E_ADMIN_CODE ?? "24681357";

test("client requests a pack, studio marks it paid, client books with a class credit", async ({ browser }) => {
  const email = uniqueEmail("pack");
  const name = `Pack Tester ${Date.now() % 10000}`;
  const client = await (await browser.newContext()).newPage();
  await signUp(client, email, "/packs?type=reformer", name);
  await client.getByRole("group", { name: "Reformer packages, 1 month" }).getByText("4 classes", { exact: true }).click();
  await client.getByText("Cash", { exact: true }).click();
  // A-012 (her answer, 8 Nov): before the request, the total, who sells it, and that paid packages aren't refundable.
  await expect(client.getByText(/^Total €[\d.,]+\. Sold by .*Re·Form Pilates Studio/)).toBeVisible();
  await expect(client.getByText(/Once paid, packages aren.t refundable/)).toBeVisible();
  await client.locator("#accept").check();
  await client.getByRole("button", { name: "Request package" }).click();
  await expect(client.getByText(/Request sent/)).toBeVisible();
  // A-009: the request remembers the Terms version they accepted.
  const db = serviceDb();
  const { data: req } = await db.from("payments").select("terms_version_id, accepted_terms_at, profiles!inner(email)").eq("profiles.email", email).eq("purpose", "pack").single();
  expect(req?.terms_version_id).toBeTruthy();
  expect(req?.accepted_terms_at).toBeTruthy();
  await expect(client.getByText("Awaiting payment")).toBeVisible();

  const admin = await (await browser.newContext()).newPage();
  await adminSignIn(admin, ADMIN, CODE);
  const row = admin.getByRole("listitem").filter({ hasText: name });
  await row.getByRole("button", { name: /^Paid · Cash/ }).click();
  // A-030: a confirm step first; nothing is granted until she says yes.
  await expect(row.getByText(/^Mark .*as paid by Cash\?$/)).toBeVisible();
  await row.getByRole("button", { name: "Not yet" }).click();
  await expect(row.getByRole("button", { name: /^Paid · Cash/ })).toBeVisible();
  await row.getByRole("button", { name: /^Paid · Cash/ }).click();
  await admin.getByRole("button", { name: "Yes, mark as paid" }).click();
  await expect(row).toHaveCount(0); // settled: leaves the "Awaiting payment" list

  await client.goto("/bookings");
  await expect(client.getByText("Reformer Package")).toBeVisible();
  await expect(client.getByText("Starts with your first class")).toBeVisible();
  await expect(client.locator('a[href^="/bookings/package/"] [data-left]').first()).toHaveText("4");
  await client.goto("/schedule");
  const days = client.getByRole("navigation", { name: "Choose a day" }).getByRole("link");
  const bookable = client.getByRole("link", { name: /reformers? left.*Book this class$/ });
  for (let i = 2; i < (await days.count()); i++) {
    await client.goto((await days.nth(i).getAttribute("href"))!);
    if (await bookable.count()) break;
  }
  await bookable.first().click();
  await client.getByRole("button", { name: /Secure your spot · 1 class/ }).click();
  await expect(client.getByText("Booking confirmed")).toBeVisible();

  // A-025: the receipt names the class type and says it isn't a tax invoice.
  const { data: paid } = await db.from("payments").select("id, profiles!inner(email)").eq("profiles.email", email).eq("status", "paid").limit(1).single();
  await client.goto(`/receipts/${paid!.id}`);
  await expect(client.getByText(/^Reformer · 4 classes/)).toBeVisible();
  await expect(client.getByText(/Payment confirmation, not a tax invoice/)).toBeVisible();
});

test("signed out: the chosen package is announced and kept through Create account (A-026, A-027)", async ({ page }) => {
  await page.goto("/packs?type=reformer");
  await page.getByRole("group", { name: "Reformer packages, 1 month" }).getByText("4 classes", { exact: true }).click();
  // A-027: an always-present live region says what was chosen, and the summary heading has focus.
  await expect(page.getByRole("status").filter({ hasText: /selected$/ })).toContainText(/4 Reformer classes, €\d+ selected/);
  await expect(page.getByRole("heading", { name: /^Reformer · 4 classes/ })).toBeFocused();
  // A-026: no terms or Request while signed out; one clear way in that remembers the choice.
  await expect(page.getByRole("button", { name: "Request package" })).toHaveCount(0);
  await page.getByRole("link", { name: "Create a free account to request this package" }).click();
  await expect(page).toHaveURL(/\/signup\?next=.*pick%3D.*why=package/);
  await expect(page.getByText("Sign in or create an account to request your package.")).toBeVisible();
  const next = new URL(page.url()).searchParams.get("next")!;
  await signUp(page, uniqueEmail("pick"), next);
  await expect(page).toHaveURL(/\/packs\?type=reformer&pick=/);
  await expect(page.locator('input[name="package"]:checked')).toHaveCount(1);
  await expect(page.getByRole("heading", { name: /^Reformer · 4 classes/ })).toBeVisible();
});
