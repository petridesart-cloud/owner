import { expect, test } from "@playwright/test";
import { serviceDb, signIn, signUp, startSignUp, uniqueEmail } from "./helpers";

// A-002, A-008, A-088: logins are linked to client records only once the email is proven.
const db = serviceDb();

async function importedClient(email: string) {
  const { data, error } = await db.from("profiles").insert({ full_name: "Imported Client", email, admin_notes: "imported" }).select("id").single();
  expect(error).toBeNull();
  await db.rpc("grant_lot", { p_profile: data!.id, p_kind: "reformer", p_credits: 4, p_expires: null as unknown as string, p_note: "Imported balance" });
  return data!.id;
}
const profile = async (id: string) => (await db.from("profiles").select("user_id, role, first_name, onboarded_at").eq("id", id).single()).data!;

test("creating an account links the client the studio imported, once the email is confirmed", async ({ page }) => {
  const email = uniqueEmail("imported");
  const id = await importedClient(email);
  await signUp(page, email, "/bookings", "Imported Person");
  await expect(page).toHaveURL(/\/bookings/);
  const p = await profile(id);
  expect(p.user_id).not.toBeNull();
  expect(p.onboarded_at).not.toBeNull();
  expect((await db.from("profiles").select("id").eq("email", email)).data).toHaveLength(1);
});

test("an underscore in an email doesn't match someone else's address", async ({ page }) => {
  const t = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const victim = await importedClient(`x.y${t}@example.com`);
  await signUp(page, `x_y${t}@example.com`, "/bookings", "Other Person");
  await expect(page).toHaveURL(/\/bookings/);
  expect((await profile(victim)).user_id).toBeNull();
  const mine = (await db.from("profiles").select("id, user_id").eq("email", `x_y${t}@example.com`).single()).data!;
  expect(mine.user_id).not.toBeNull();
  expect(mine.id).not.toBe(victim);
});

test("a login made outside the app (already confirmed) gets neither an imported client nor a team invite", async ({ page }) => {
  const email = uniqueEmail("outside");
  const id = await importedClient(email);
  await db.auth.admin.createUser({ email, password: "outside-pass-1", email_confirm: true });
  await signIn(page, email, "/bookings", "outside-pass-1");
  await expect(page.getByText(/Please confirm it's you/)).toBeVisible();
  expect((await profile(id)).user_id).toBeNull();

  const invited = `team-${Date.now()}@studio-test.cy`;
  await db.from("team_invites").insert({ email: invited });
  await db.auth.admin.createUser({ email: invited, password: "outside-pass-1", email_confirm: true });
  await signIn(page, invited, "/", "outside-pass-1");
  await expect(page).not.toHaveURL(/\/admin/);
  expect((await db.from("profiles").select("id").eq("email", invited).eq("role", "admin")).data).toHaveLength(0);
});

test("re-running sign-up from another browser can't put its details or password on the account", async ({ page, browser }) => {
  const email = uniqueEmail("rerun");
  await startSignUp(page, email, "Real", "real-pass-123");
  const other = await browser.newContext();
  const attacker = await other.newPage();
  await startSignUp(attacker, email, "Attacker", "attacker-pass-1");
  // The real owner asks for a new code and confirms in their own browser.
  await page.getByRole("button", { name: "Send a new code" }).click();
  await expect(page.getByRole("button", { name: "New code sent" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.waitForURL(/\/welcome/);
  const uid = (await db.from("profiles").select("first_name").eq("email", email).single()).data;
  expect(uid?.first_name ?? null).not.toBe("Attacker");
  await signIn(attacker, email, "/account", "attacker-pass-1");
  await expect(attacker.getByText("Email or password isn't right.")).toBeVisible();
  await other.close();
});

test("an unconfirmed account can be finished on another device by signing in with its password", async ({ page, browser }) => {
  const email = uniqueEmail("device");
  await startSignUp(page, email, "Phone", "real-pass-123");
  const laptop = await (await browser.newContext()).newPage();
  await signIn(laptop, email, "/bookings", "wrong-pass-123");
  await expect(laptop.getByText("Email or password isn't right.")).toBeVisible();
  await signIn(laptop, email, "/bookings", "real-pass-123");
  await expect(laptop.getByLabel("Code from your email")).toHaveValue(/^\d{6,10}$/);
  await laptop.getByRole("button", { name: "Confirm" }).click();
  await laptop.waitForURL(/\/health/);
  expect((await db.from("profiles").select("first_name").eq("email", email).single()).data?.first_name).toBe("Phone");
});
