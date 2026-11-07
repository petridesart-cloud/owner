import { expect, test, type Page } from "@playwright/test";
import { signIn, signUp, uniqueEmail } from "./helpers";

// WP10: an axe-core run (WCAG 2.0/2.1/2.2 A and AA rules) on the main client pages: no serious or critical findings.
async function axe(page: Page) {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  return page.evaluate(async () => {
    // @ts-expect-error injected by the script tag above
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
    return r.violations.filter((v: { impact?: string }) => v.impact === "serious" || v.impact === "critical")
      .map((v: { id: string; nodes: { target: unknown[] }[] }) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  });
}

test("axe: no serious findings on Sign-up, Home, Schedule, Packs, My classes and Health", async ({ page }) => {
  test.setTimeout(180_000);
  // Signed out: Sign-up, Home, Schedule, Packs.
  for (const url of ["/signup", "/", "/schedule", "/packs?type=reformer"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    expect(await axe(page), url).toEqual([]);
  }
  // Packs with a package chosen.
  await page.getByRole("group", { name: "Reformer packages, 1 month" }).getByText("4 classes", { exact: true }).click();
  expect(await axe(page), "packs with a choice").toEqual([]);

  // Signed in: Home, My classes, Health (both steps).
  await signIn(page, "elena@example.com", "/");
  await page.waitForURL("/");
  for (const url of ["/", "/bookings", "/account"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    expect(await axe(page), url).toEqual([]);
  }
  const fresh = await (await page.context().browser()!.newContext()).newPage();
  await signUp(fresh, uniqueEmail("axe"), "/");
  await fresh.goto("/health");
  expect(await axe(fresh), "health step 1").toEqual([]);
  // Their answer at sign-up ("No injuries") is already ticked.
  await fresh.getByRole("button", { name: "Next" }).click();
  await expect(fresh.getByText("Step 2 of 2")).toBeFocused();
  expect(await axe(fresh), "health step 2").toEqual([]);
});
