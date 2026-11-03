import { expect, test } from "@playwright/test";
import { adminSignIn, signUp, uniqueEmail } from "./helpers";

const ADMIN = process.env.E2E_ADMIN_EMAIL ?? "studio@example.com";
const CODE = process.env.E2E_ADMIN_CODE ?? "24681357";

test("a discount code and a personal reward: right price, noted on the request, free class added when paid", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await adminSignIn(admin, ADMIN, CODE);
  const code = `E2E${Date.now().toString(36).toUpperCase().slice(-6)}`;
  await admin.goto("/admin/clients/codes");
  await admin.getByLabel("Code", { exact: true }).fill(code);
  await admin.getByLabel("Percent").fill("15");
  await admin.getByRole("button", { name: "Create code" }).click();
  await expect(admin.getByText(`${code} is live: 15% off on packages.`)).toBeVisible();

  // The client types the code: 4 classes €70 → €59.50.
  const name = `Reward Tester ${Date.now() % 10000}`;
  const client = await (await browser.newContext()).newPage();
  await signUp(client, uniqueEmail("reward"), "/packs?type=reformer", name);
  const fourClasses = client.getByRole("group", { name: "Reformer packages, valid 30 days" }).getByText("4 classes", { exact: true });
  await fourClasses.click();
  await client.getByRole("button", { name: "Have a code?" }).click();
  await client.getByLabel("Discount code").fill(code.toLowerCase());
  await client.getByRole("button", { name: "Apply" }).click();
  await expect(client.getByText(`Code ${code}: 15% off`)).toBeVisible();
  await expect(client.getByText("€59.50").first()).toBeVisible();
  await client.locator("#accept").check();
  await client.getByRole("button", { name: "Request package" }).click();
  await expect(client.getByText(/Request sent/)).toBeVisible();
  await expect(client.getByText(`Code ${code}: 15% off`)).toBeVisible(); // under "Awaiting payment"

  await admin.goto("/admin");
  const row = admin.getByRole("listitem").filter({ hasText: name });
  await expect(row).toContainText("€59.50");
  await row.getByRole("button", { name: "Cash" }).click();
  await expect(row).toHaveCount(0);

  // A personal reward: 1 free class, applied by itself on the next package.
  await admin.goto(`/admin/clients?q=${encodeURIComponent(name)}`);
  await admin.getByRole("link", { name: new RegExp(name) }).click();
  await admin.getByText("Give a reward").click();
  await admin.getByLabel("What it gives").selectOption("free_classes");
  await admin.getByRole("button", { name: "Give reward" }).click();
  await expect(admin.getByText(/Saved: 1 free class added to your next package/)).toBeVisible();

  await client.goto("/packs?type=reformer");
  await fourClasses.click();
  await expect(client.getByText("Your reward: 1 free class added to this package")).toBeVisible();
  await client.locator("#accept").check();
  await client.getByRole("button", { name: "Request package" }).click();
  await expect(client.getByText(/Request sent/)).toBeVisible();

  await admin.goto("/admin");
  await admin.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Cash" }).click();
  await expect(admin.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
  await client.goto("/bookings");
  await expect(client.locator('a[href^="/bookings/package/"] [data-left]').filter({ hasText: /^5$/ })).toHaveCount(1);
});
