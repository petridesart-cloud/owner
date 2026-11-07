import { expect, test } from "@playwright/test";
import { adminSignIn, openBookableClass, serviceDb, signIn, signUp, uniqueEmail } from "./helpers";

// 4.1 Account deletion (A-010, A-063): sign up, book, export own data, delete, and nothing is left to sign in to.
test("a client exports their data, deletes their account, and their spot is freed", async ({ page }) => {
  const email = uniqueEmail("erase");
  await openBookableClass(page);
  const url = new URL(page.url()).pathname;
  const sessionId = url.split("/").pop()!;
  await page.getByRole("link", { name: "Secure your spot" }).click();
  await signUp(page, email, url, "Erin Erasable");
  await page.getByRole("button", { name: /Book your trial · €/ }).click();
  await expect(page.getByText("Booking confirmed")).toBeVisible();

  // Their own data, with the Art. 15 information, and nobody else's.
  const res = await page.request.get("/api/account/export");
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.profile.email).toBe(email);
  expect(data.about.controller.name).toBeTruthy();
  expect(data.about.rights).toMatch(/delete/);
  expect(data.bookings).toHaveLength(1);
  expect(JSON.stringify(data)).not.toContain("elena@example.com");

  await page.goto("/account?delete=confirm");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.waitForURL(/\/\?deleted=1/);

  // Signed out, and the old password no longer works.
  expect((await page.request.get("/api/account/export")).status()).toBe(401);
  await signIn(page, email, "/", "test-pass-123");
  await expect(page.getByRole("alert").or(page.getByText(/didn.t work|isn.t right|no account|wrong/i)).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  // The spot is free again; the booking stays only as an anonymous record.
  const db = serviceDb();
  const { data: p } = await db.from("profiles").select("id, full_name, email, deleted_at").eq("full_name", "Deleted client").order("deleted_at", { ascending: false }).limit(1).single();
  expect(p?.email).toBeNull();
  const { data: b } = await db.from("bookings").select("status").eq("profile_id", p!.id).eq("session_id", sessionId).single();
  expect(b?.status).toBe("cancelled");
  const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).or(`recipient.eq.${email},body.ilike.%${email}%`);
  expect(count).toBe(0);
});

test("a failed deletion says so and keeps the account", async ({ page }) => {
  await signIn(page, "elena@example.com", "/account");
  await page.waitForURL(/\/account/);
  await page.goto("/account?delete=failed");
  await expect(page.getByText(/couldn.t be deleted just now, so nothing was removed/)).toBeVisible();
});

// A-059: someone she added by hand (no login) asks by DM to see and erase their data.
test("the studio exports and erases a client without a login", async ({ page }) => {
  const db = serviceDb();
  const email = uniqueEmail("dm");
  const { data: p } = await db.from("profiles").insert({ full_name: "Dana Direct", email, phone: "+357 99 123321" }).select("id").single();
  await signIn(page, process.env.E2E_ADMIN_EMAIL ?? "studio@example.com", "/admin", process.env.E2E_ADMIN_CODE ?? "24681357");
  await page.waitForURL(/\/admin/);
  await page.goto(`/admin/clients/${p!.id}`);
  const res = await page.request.get(`/admin/clients/${p!.id}/export`);
  expect(res.status()).toBe(200);
  expect((await res.json()).profile.email).toBe(email);
  await page.getByText("Privacy & data").click();
  await page.getByLabel("Type ERASE to confirm").fill("ERASE");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Erase this client" }).click();
  await expect(page.getByText("Their personal data has been erased.")).toBeVisible();
  const { data: after } = await db.from("profiles").select("full_name, email, phone, deleted_at").eq("id", p!.id).single();
  expect(after).toMatchObject({ full_name: "Deleted client", email: null, phone: null });
  // A client can't download someone else's data through the studio route.
  await page.context().clearCookies();
  await signIn(page, "elena@example.com", "/");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  expect((await page.request.get(`/admin/clients/${p!.id}/export`)).status()).toBe(404);
});

// V-008 (owner's answer, 7 Nov): only the instructor (the studio owner) can erase another admin's account.
test("only the instructor can erase another studio admin (V-008)", async ({ page }) => {
  const db = serviceDb();
  const target = uniqueEmail("adm");
  const { data: t } = await db.from("profiles").insert({ full_name: "Alex Admin", email: target, role: "admin" }).select("id").single();
  const staff = uniqueEmail("staff");
  await db.from("profiles").insert({ full_name: "Sam Staff", email: staff, role: "admin", can_view_health: false });
  const erase = async () => {
    await page.goto(`/admin/clients/${t!.id}`);
    await page.getByText("Privacy & data").click();
    await page.getByLabel("Type ERASE to confirm").fill("ERASE");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Erase this client" }).click();
  };
  await adminSignIn(page, staff, process.env.E2E_ADMIN_CODE ?? "24681357");
  await erase();
  await expect(page.getByText(/Only the studio owner can erase a studio admin/)).toBeVisible();
  expect((await db.from("profiles").select("deleted_at").eq("id", t!.id).single()).data?.deleted_at).toBeNull();
  await page.context().clearCookies();
  await adminSignIn(page, process.env.E2E_ADMIN_EMAIL ?? "studio@example.com", process.env.E2E_ADMIN_CODE ?? "24681357");
  await erase();
  await expect(page.getByText("Their personal data has been erased.")).toBeVisible();
});
