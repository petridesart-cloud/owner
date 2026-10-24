// Friendly copy for booking-engine errors raised in Postgres.
const MESSAGES: Record<string, string> = {
  full: "Someone just took the last spot. Join the waitlist and we'll let you know if it opens up.",
  already_booked: "You're already booked into this class.",
  already_waitlisted: "You're already on the waitlist for this class.",
  not_full: "Good news: a spot is free. You can book it now.",
  class_cancelled: "This class has been cancelled.",
  class_started: "This class has already started.",
  class_past: "This class is in the past.",
  no_credits: "You don't have a class left for this class type. Get a package to book.",
  beyond_expiry: "This class is after your package's expiry date, so it can't be booked with it. A new package will cover it.",
  studio_closed: "The studio is closed that day.",
  payment_cancelled: "That payment request was cancelled or has expired.",
  credits_not_accepted: "Credits can't be used for this event. It's paid individually.",
  not_cancellable: "This booking can't be cancelled.",
  not_found: "We couldn't find that. Please refresh and try again.",
  beyond_window: "This class isn't open for booking yet. Classes open 4 weeks ahead.",
  trial_used: "The trial is for your first class of this type. Choose a drop-in or a package instead.",
  trial_not_available: "There's no trial for this class.",
  unpaid_limit: "You already have a class waiting for payment. Once it's settled you can reserve another, or get a package.",
  pay_later_off: "Please get a package first.",
  event_no_cancel: "Events can't be cancelled or refunded in the app. Please message the studio.",
  clients_only: "This event is for Re·Form clients. Come to a class or get a package to join the next one.",
};

export function friendlyError(e: unknown): string {
  const msg = typeof e === "object" && e && "message" in e ? String((e as { message: string }).message) : String(e);
  return MESSAGES[msg] ?? "Something went wrong. Please try again.";
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
