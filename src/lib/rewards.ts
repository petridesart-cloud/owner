import "server-only";
import { db } from "@/lib/supabase/admin";
import { todayKey } from "@/lib/time";
import { discountLabel, normaliseCode, type Discount, type DiscountTarget } from "@/lib/discount";

type Row = { id: string; code: string; kind: string; value: number; profile_id: string | null; expires_on: string | null; max_uses: number | null; active: boolean; applies_to: string[] };

const toDiscount = (r: Row): Discount & { id: string } => ({
  id: r.id, code: r.code, kind: r.kind as Discount["kind"], value: r.value,
  label: discountLabel(r.kind as Discount["kind"], r.value), personal: !!r.profile_id, expiresOn: r.expires_on, appliesTo: (r.applies_to ?? ["package"]) as DiscountTarget[],
});

/** Uses of a code: requests still waiting for payment and paid ones (an expired or removed request frees it). */
async function uses(codeId: string, opts: { profileId?: string; except?: string } = {}) {
  let q = db().from("payments").select("id", { count: "exact", head: true }).eq("discount_code_id", codeId).in("status", ["pending", "paid"]);
  if (opts.profileId) q = q.eq("profile_id", opts.profileId);
  if (opts.except) q = q.neq("id", opts.except);
  const { count } = await q;
  return count ?? 0;
}

/** Check a code for this client. `except` = their current request for the same package (re-requesting isn't a second use). */
export async function findCode(profileId: string, typed: string, except?: string, target?: DiscountTarget): Promise<{ ok: true; discount: Discount & { id: string } } | { ok: false; error: string }> {
  const code = normaliseCode(typed);
  if (code.length < 3) return { ok: false, error: "Please type the code." };
  const { data } = await db().from("discount_codes").select("id, code, kind, value, profile_id, expires_on, max_uses, active, applies_to").eq("code", code).maybeSingle();
  const r = data as Row | null;
  if (!r || !r.active || (r.profile_id && r.profile_id !== profileId)) return { ok: false, error: "That code isn't valid." };
  if (r.expires_on && r.expires_on < todayKey()) return { ok: false, error: "That code has expired." };
  if (target && !(r.applies_to ?? ["package"]).includes(target)) return { ok: false, error: `That code isn't for ${target === "drop_in" ? "drop-ins" : `${target}s`}.` };
  if (await uses(r.id, { profileId, except })) return { ok: false, error: "You've already used this code." };
  if (r.max_uses && (await uses(r.id, { except })) >= r.max_uses) return { ok: false, error: "That code has been used up." };
  return { ok: true, discount: toDiscount(r) };
}

/** Personal rewards ready to use, newest first. */
export async function availableRewards(profileId: string, target?: DiscountTarget) {
  const { data } = await db().from("discount_codes").select("id, code, kind, value, profile_id, expires_on, max_uses, active, applies_to")
    .eq("profile_id", profileId).eq("active", true).order("created_at", { ascending: false });
  const today = todayKey();
  const open = ((data ?? []) as Row[]).filter((r) => !(r.expires_on && r.expires_on < today) && !(target && !(r.applies_to ?? ["package"]).includes(target)));
  if (!open.length) return [];
  // One query for all of this client's uses (A-051), not one per reward.
  const { data: used } = await db().from("payments").select("discount_code_id").eq("profile_id", profileId)
    .in("discount_code_id", open.map((r) => r.id)).in("status", ["pending", "paid"]);
  const usedIds = new Set((used ?? []).map((u) => u.discount_code_id));
  return open.filter((r) => !usedIds.has(r.id)).map(toDiscount);
}

/** A readable code for a personal reward, e.g. RW-7KQ2MD (no 0/O/1/I to mix up). */
export function rewardCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `RW-${[...bytes].map((b) => abc[b % abc.length]).join("")}`;
}
