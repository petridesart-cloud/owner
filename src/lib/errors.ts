// Friendly copy for booking-engine errors raised in Postgres.
const MESSAGES: Record<string, string> = {
  full: "Someone just took the last spot. Join the waitlist and we'll let you know if it opens up.",
  already_booked: "You're already booked into this class.",
  already_waitlisted: "You're already on the waitlist for this class.",
  not_full: "Good news: a spot is free. You can book it now.",
  class_cancelled: "This class has been cancelled.",
  class_started: "This class has already started.",
  class_past: "This class is in the past.",
  no_credits: "You don't have a valid credit for this class type.",
  credits_not_accepted: "Credits can't be used for this event. It's paid individually.",
  not_cancellable: "This booking can't be cancelled.",
  not_found: "We couldn't find that. Please refresh and try again.",
};

export function friendlyError(e: unknown): string {
  const msg = typeof e === "object" && e && "message" in e ? String((e as { message: string }).message) : String(e);
  return MESSAGES[msg] ?? "Something went wrong. Please try again.";
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
