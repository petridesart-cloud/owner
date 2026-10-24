import { expect, test } from "@playwright/test";
import { completeWelcome, signIn, uniqueEmail } from "./helpers";

const ADMIN = process.env.E2E_ADMIN_EMAIL ?? "studio@example.com";
const CODE = process.env.E2E_ADMIN_CODE ?? "24681357";

test("client requests a pack, studio marks it paid, client books with a class credit", async ({ browser }) => {
  const email = uniqueEmail("pack");
  const name = `Pack Tester ${Date.now() % 10000}`;
  const client = await (await browser.newContext()).newPage();
  await signIn(client, email, "/packs");
  await completeWelcome(client, name);
  await client.getByRole("group", { name: "Reformer, 1 month" }).getByText("1 per week").click();
  await client.getByText("Cash", { exact: true }).click();
  await client.locator("#accept").check();
  await client.getByRole("button", { name: "Request package" }).click();
  await expect(client.getByText(/Request sent/)).toBeVisible();
  await expect(client.getByText("Awaiting payment")).toBeVisible();

  const admin = await (await browser.newContext()).newPage();
  await admin.goto("/login");
  await admin.getByLabel("Email").fill(ADMIN);
  await admin.getByRole("button", { name: "Send my code" }).click();
  await admin.getByLabel("Studio password").fill(CODE);
  await admin.getByRole("button", { name: "Continue" }).click();
  await expect(admin).toHaveURL(/\/admin/);
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
