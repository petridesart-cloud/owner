import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { adminSignIn, openBookableClass, serviceDb, signUp, uniqueEmail } from "./helpers";

// Authorization (audit §4.1): client B can't reach client A's pages, files or actions, and a client
// can't use the studio's. Direct anon-key/RLS access is covered in tests/engine.test.ts "RLS: …".

/** A server action's id from the production build, so a test can post it like a crafted request. */
function actionId(name: string) {
  const m = JSON.parse(fs.readFileSync(".next/server/server-reference-manifest.json", "utf8")) as { node: Record<string, { exportedName?: string }> };
  const id = Object.entries(m.node).find(([, v]) => v.exportedName === name)?.[0];
  if (!id) throw new Error(`no server action ${name}`);
  return id;
}
async function postAction(page: Page, name: string, args: unknown[]) {
  return page.request.post("/", { headers: { "Next-Action": actionId(name), "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" }, data: JSON.stringify(args), maxRedirects: 0 });
}

/** Client A with a future booking, a paid payment and a package (a demo client keeps them). */
async function clientA() {
  const db = serviceDb();
  const a = (await db.from("profiles").select("id").eq("email", "elena@example.com").single()).data!;
  const lot = (await db.from("credit_lots").select("id").eq("profile_id", a.id).limit(1).single()).data!;
  const pay = (await db.from("payments").select("id").eq("profile_id", a.id).eq("status", "paid").limit(1).single()).data!;
  const booking = (await db.from("bookings").select("id, class_sessions!inner(starts_at)").eq("profile_id", a.id).eq("status", "confirmed")
    .gt("class_sessions.starts_at", new Date(Date.now() + 7 * 3_600_000).toISOString()).limit(1).single()).data!;
  return { id: a.id, lot: lot.id, payment: pay.id, booking: booking.id };
}

test("client B can't open client A's receipt, calendar file, package or booking, or cancel A's class", async ({ page }) => {
  const a = await clientA();
  await signUp(page, uniqueEmail("client-b"));
  for (const url of [`/receipts/${a.payment}`, `/api/ics/${a.booking}`, `/bookings/package/${a.lot}`, `/bookings/${a.booking}/confirmed`]) {
    const res = await page.request.get(url, { maxRedirects: 0 });
    // Client pages stream behind a loading skeleton, so notFound() arrives as the not-found page with
    // status 200 (and noindex); the calendar file is a route handler and answers 404.
    if (res.status() !== 404) {
      expect(res.status(), url).toBe(200);
      const html = await res.text();
      expect(html, url).toContain("Page not found");
      expect(html, url).not.toMatch(/Elena|Receipt no|Payment confirmation/i);
    }
  }
  const res = await postAction(page, "cancelAction", [a.booking]);
  expect(res.status()).toBeLessThan(500);
  expect(await res.text()).toContain('"ok":false');
  const { data: b } = await serviceDb().from("bookings").select("status").eq("id", a.booking).single();
  expect(b!.status).toBe("confirmed");
  // The data export holds only B's own rows.
  const exp = await (await page.request.get("/api/account/export")).text();
  expect(exp).not.toContain(a.id);
  expect(exp).not.toContain("elena@example.com");
});

test("a client can't use the studio's actions or exports", async ({ page }) => {
  const email = uniqueEmail("not-admin");
  await signUp(page, email);
  const db = serviceDb();
  const me = (await db.from("profiles").select("id").eq("email", email).single()).data!;
  const pay = (await db.from("payments").insert({ profile_id: me.id, provider: "offline", amount_cents: 13000, purpose: "pack", description: "Reformer · 8 classes · 1 month", status: "pending" }).select("id").single()).data!;
  await postAction(page, "markPaid", [pay.id, "cash"]);
  expect((await db.from("payments").select("status").eq("id", pay.id).single()).data!.status).toBe("pending");
  expect((await db.from("credit_lots").select("id").eq("profile_id", me.id)).data!.length).toBe(0);
  expect((await page.request.get("/admin/export/payments", { maxRedirects: 0 })).status()).toBe(404);
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);
});

test("pages load without Content-Security-Policy violations, signed out, as a client and in the studio", async ({ browser }) => {
  const violations: string[] = [];
  const visit = async (page: Page, urls: string[]) => {
    page.on("console", (m) => { if (/Content.Security.Policy/i.test(m.text())) violations.push(m.text()); });
    page.on("request", (r) => { if (r.url().includes("/api/csp-report")) violations.push(`report: ${r.postData() ?? ""}`); });
    for (const url of urls) {
      const res = await page.goto(url);
      expect(res!.headers()["content-security-policy-report-only"], url).toMatch(/script-src 'self' 'nonce-/);
      await page.waitForLoadState("networkidle");
    }
  };
  const anon = await browser.newPage();
  await visit(anon, ["/", "/schedule", "/packs", "/studio", "/events", "/policy", "/login", "/signup", "/no-such-page"]);
  const client = await browser.newPage();
  await signUp(client, uniqueEmail("csp"));
  await visit(client, ["/bookings", "/account", "/packs"]);
  await openBookableClass(client);
  const studio = await browser.newPage();
  await adminSignIn(studio, process.env.E2E_ADMIN_EMAIL ?? "studio@example.com", process.env.E2E_ADMIN_CODE ?? "24681357");
  await visit(studio, ["/admin", "/admin/classes", "/admin/clients", "/admin/stats", "/admin/settings", "/admin/outbox", "/admin/photos"]);
  expect(violations).toEqual([]);
});
