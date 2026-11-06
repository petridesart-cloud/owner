import { expect, test } from "@playwright/test";
import { serviceDb, signIn, signUp, uniqueEmail } from "./helpers";

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
