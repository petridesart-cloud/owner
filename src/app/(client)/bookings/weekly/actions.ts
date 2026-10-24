"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOnboarded } from "@/lib/auth";
import { saveRecurring, weeklySlots } from "@/lib/recurring";
import { TOO_MANY, bookingLimited } from "@/lib/rate-limit";

export type WeeklyState = { ok: boolean; message?: string; error?: string };

export async function saveWeekly(_: WeeklyState, form: FormData): Promise<WeeklyState> {
  const viewer = await requireOnboarded("/bookings/weekly");
  if (await bookingLimited(viewer.profile.id)) return { ok: false, error: TOO_MANY };
  const picked = z.array(z.string().regex(/^[0-9a-f-]{36}\|[1-7]\|\d{2}:\d{2}$/)).max(14).safeParse(form.getAll("slot"));
  if (!picked.success) return { ok: false, error: "Please pick from the list." };
  // Only slots that are really on the timetable.
  const open = new Set((await weeklySlots()).map((s) => `${s.classTypeId}|${s.weekday}|${s.hhmm}`));
  const slots = picked.data.filter((k) => open.has(k)).map((k) => {
    const [classTypeId, weekday, hhmm] = k.split("|");
    return { classTypeId, weekday: Number(weekday), hhmm };
  });
  const { booked } = await saveRecurring(viewer.profile.id, slots);
  revalidatePath("/bookings");
  revalidatePath("/");
  if (!slots.length) return { ok: true, message: "Weekly booking is off. Classes already booked stay booked." };
  return { ok: true, message: booked ? `Saved. ${booked} class${booked === 1 ? "" : "es"} booked; we'll keep booking new weeks as they open.` : "Saved. We'll book these as new weeks open and while your package lasts." };
}
