import { expect, test } from "@playwright/test";
import { adminSignIn } from "./helpers";

const ADMIN = process.env.E2E_ADMIN_EMAIL ?? "studio@example.com";
const CODE = process.env.E2E_ADMIN_CODE ?? "24681357";

test("the studio builds a new class type with a trial; clients see its own tab; she can delete it", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await adminSignIn(admin, ADMIN, CODE);
  const label = `Pre natal ${Date.now().toString(36).slice(-4)}`;
  await admin.goto("/admin/settings");
  await admin.getByText("+ Add a package or single class").click();
  await admin.getByRole("radio", { name: "Single class" }).click();
  await admin.locator("#offer-name").fill(`${label} Reformer Trial`);
  await admin.locator("#offer-for").selectOption({ label: "+ New class type…" });
  const box = admin.getByRole("group", { name: "New class type" });
  await box.locator("#nct-name").fill(label);
  await box.getByRole("button", { name: "Save", exact: true }).click();
  await expect(admin.getByText(`${label} added. It's under Class types too.`)).toBeVisible();
  await expect(admin.locator("#offer-for")).toHaveValue(/pre_natal/);
  await admin.locator("#offer-price").fill("20");
  await admin.getByRole("button", { name: "Save single class" }).click();
  await expect(admin.getByText(/Single class added/)).toBeVisible();

  const client = await (await browser.newContext()).newPage();
  await client.goto("/packs");
  await client.getByRole("link", { name: label }).click();
  await expect(client.getByText(`${label} Reformer Trial`)).toBeVisible();
  await expect(client.getByText("€20")).toBeVisible();

  // Delete it again: gone from the client's Packages page.
  await admin.reload();
  const item = admin.locator("details", { has: admin.locator("summary", { hasText: `${label} Reformer Trial` }) });
  await item.locator("summary").click();
  admin.once("dialog", (d) => d.accept());
  await item.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(item).toHaveCount(0); // gone from her list
  await client.goto("/packs");
  await expect(client.getByRole("link", { name: label })).toHaveCount(0);

  // And the class type (nothing booked with it yet, so it's removed completely).
  // The class type (not its Packages page tab, which has the same name).
  const type = admin.locator("section", { has: admin.getByRole("heading", { name: "Class types" }) })
    .locator("details", { has: admin.locator("summary", { hasText: label }) });
  await type.locator("summary").click();
  admin.once("dialog", (d) => d.accept());
  await type.getByRole("button", { name: `Delete ${label}` }).click();
  await expect(type).toHaveCount(0);
});

test("her tabs: Mat and Reformer for clients; Pre and Post Natal and Private set up but hidden until she shows them", async ({ browser }) => {
  const client = await (await browser.newContext()).newPage();
  await client.goto("/packs");
  await expect(client.getByRole("link", { name: "Mat", exact: true })).toBeVisible();
  await expect(client.getByRole("link", { name: "Reformer", exact: true })).toBeVisible();
  await expect(client.getByRole("link", { name: /Private/ })).toHaveCount(0);
  await expect(client.getByRole("link", { name: /Pre and Post Natal/ })).toHaveCount(0);

  const admin = await (await browser.newContext()).newPage();
  await adminSignIn(admin, ADMIN, CODE);
  await admin.goto("/packs?type=private");
  await expect(admin.getByText("Only you can see this tab.")).toBeVisible();
  await expect(admin.getByText(/no open slots to book in the app/)).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Pre & Post Natal · Reformer based" })).toBeVisible();
});
