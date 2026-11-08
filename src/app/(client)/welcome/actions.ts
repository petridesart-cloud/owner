"use server";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { z } from "zod";
import { getSettings, requireViewer } from "@/lib/auth";
import { dobSchema, nameSchema, phoneSchema } from "@/lib/profile";
import { onboard } from "@/lib/auth-flow";
import { friendlyError } from "@/lib/errors";

export type WelcomeState = { ok: boolean; errors?: Record<string, string>; redirect?: string };

const Schema = z.object({ first_name: nameSchema, last_name: nameSchema, phone: phoneSchema, date_of_birth: dobSchema });

export async function completeWelcome(_: WelcomeState, form: FormData): Promise<WelcomeState> {
  const viewer = await requireViewer();
  const settings = await getSettings();
  const parsed = Schema.safeParse({
    first_name: form.get("first_name"), last_name: form.get("last_name"), phone: form.get("phone"), date_of_birth: form.get("date_of_birth") ?? "",
  });
  const errors: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;

  const policy = form.get("policy") === "on";
  const photos = String(form.get("photo_consent") ?? "");
  if (!policy) errors.policy = "Please accept the studio's terms and policies to book.";
  if (Object.keys(errors).length || !parsed.success) return { ok: false, errors };

  // Details and consents in one transaction (A-019), shared with sign-up confirmation.
  try {
    await onboard(viewer.profile, viewer.email, {
      ...parsed.data, photo_consent: photos, marketing_email: form.get("marketing_email") === "on",
    }, settings.policy_version);
  } catch (e) {
    return { ok: false, errors: { form: friendlyError(e) } };
  }
  // Step 2: the health questions on their own page.
  const next = String(form.get("next") ?? "/");
  redirect(`/health?next=${encodeURIComponent(safeNext(next))}`);
}
