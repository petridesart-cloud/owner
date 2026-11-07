import { expect, test } from "@playwright/test";
import { adminSignIn, serviceDb, signUp, uniqueEmail } from "./helpers";

const ADMIN = process.env.E2E_ADMIN_EMAIL ?? "studio@example.com";
const CODE = process.env.E2E_ADMIN_CODE ?? "24681357";

test("client requests a pack, studio marks it paid, client books with a class credit", async ({ browser }) => {
  const email = uniqueEmail("pack");
  const name = `Pack Tester ${Date.now() % 10000}`;
  const client = await (await browser.newContext()).newPage();
  await signUp(client, email, "/packs?type=reformer", name);
  await client.getByRole("group", { name: "Reformer packages, valid 30 days" }).getByText("4 classes", { exact: true }).click();
  await client.getByText("Cash", { exact: true }).click();
  // A-012: before the request, the total, "no VAT charged", who sells it and the 14-day withdrawal summary.
  await expect(client.getByText(/^Total €[\d.,]+ \(no VAT charged\)\. Sold by .*Re·Form Pilates Studio/)).toBeVisible();
  await expect(client.getByText(/withdraw within 14 days of payment/)).toBeVisible();
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
  await row.getByRole("button", { name: "Cash" }).click();
  await expect(row).toHaveCount(0); // settled: leaves the "Awaiting payment" list

  await client.goto("/bookings");
  await expect(client.getByText("Reformer Package")).toBeVisible();
  await expect(client.getByText("Starts with your first class")).toBeVisible();
  await expect(client.locator('a[href^="/bookings/package/"] [data-left]').first()).toHaveText("4");
  await client.goto("/schedule");
  const days = client.getByRole("navigation", { name: "Choose a day" }).getByRole("link");
  const bookable = client.getByRole("link", { name: /^Book .*reformers? left/ });
  for (let i = 2; i < (await days.count()); i++) {
    await client.goto((await days.nth(i).getAttribute("href"))!);
    if (await bookable.count()) break;
  }
  await bookable.first().click();
  await client.getByRole("button", { name: /Secure your spot · 1 class/ }).click();
  await expect(client.getByText("Booking confirmed")).toBeVisible();
});
