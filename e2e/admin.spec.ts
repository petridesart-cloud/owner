import { expect, test } from "@playwright/test";
import { adminSignIn, serviceDb, signUp, uniqueEmail } from "./helpers";

const ADMIN = process.env.E2E_ADMIN_EMAIL ?? "studio@example.com";
const CODE = process.env.E2E_ADMIN_CODE ?? "24681357";

test("clients cannot open the studio admin", async ({ page }) => {
  await signUp(page, uniqueEmail("nosy"));
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);
});

test("the studio signs in with email + password and lands in the studio", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN);
  await page.getByLabel("Password").fill("11112222");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password isn't right.")).toBeVisible();
  await expect(page.getByText(/no email is sent/i)).toHaveCount(0);
  // A-031: a refund to pay back shows on Today and can be marked refunded (same sign-in: the per-email limit).
  const db = serviceDb();
  const { data: prof } = await db.from("profiles").insert({ full_name: "Refund Client", email: uniqueEmail("refund") }).select("id").single();
  const what = `E2E refund event ${Date.now() % 100000}`;
  const { data: pay } = await db.from("payments").insert({ profile_id: prof!.id, provider: "offline", amount_cents: 4000, status: "needs_refund", purpose: "booking", description: what, method: "revolut" }).select("id").single();
  await adminSignIn(page, ADMIN, CODE);
  const list = page.locator("section", { has: page.getByRole("heading", { name: "Refunds to pay back" }) });
  await expect(list.getByText(`${what} · €40 · paid by Revolut`)).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await list.getByRole("button", { name: `Mark as refunded: Refund Client: ${what}` }).click();
  await expect.poll(async () => (await db.from("payments").select("status").eq("id", pay!.id).single()).data?.status).toBe("refunded");
  await expect(page.getByText(what)).toHaveCount(0); // settled: it leaves the list

  await page.getByRole("link", { name: "Classes" }).click();
  await expect(page.getByRole("heading", { name: "Classes" })).toBeVisible();
});


// Her note (9 Nov): she can find any past event and change the words shown under it in Previous events.
test("the studio edits a past event's text from Past events, and Previous events shows it", async ({ page }) => {
  const db = serviceDb();
  const { data: type } = await db.from("class_types").select("id").eq("kind", "event").limit(1).single();
  const start = new Date(Date.now() - 40 * 86_400_000);
  const title = `Sunset SUP ${Date.now()}`;
  const { data: ev } = await db.from("class_sessions").insert({
    class_type_id: type!.id, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 90 * 60_000).toISOString(),
    capacity: 8, price_cents: 0, title, status: "scheduled",
  }).select("id").single();
  await adminSignIn(page, process.env.E2E_ADMIN_EMAIL ?? "studio@example.com", process.env.E2E_ADMIN_CODE ?? "24681357");
  await page.goto("/admin/classes");
  await page.getByRole("link", { name: /Past events/ }).click();
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/classes/${ev!.id}`));
  await page.getByLabel("After the event (optional)").fill("Calm water and a golden sky. Thank you all!");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.goto("/events");
  await expect(page.getByText("Calm water and a golden sky. Thank you all!")).toBeVisible();
});
