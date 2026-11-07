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
  minor_not_allowed: "Classes are for adults: this person is under 18 on the day of the class.",
  documents_not_accepted: "Please accept the Studio Rules, policies, Terms and Health & Safety acknowledgement.",
  empty_policy: "That text is empty. Write something, or empty it to go back to the default.",
  policy_versions_append_only: "Earlier versions of the legal texts are kept as they were.",
  not_found: "We couldn't find that. Please refresh and try again.",
  beyond_window: "This class isn't open for booking yet. Classes open 4 weeks ahead.",
  trial_used: "The trial is for your first class of this type. Choose a drop-in or a package instead.",
  trial_not_available: "There's no trial for this class.",
  unpaid_limit: "You already have a class waiting for payment. Once it's settled you can reserve another, or get a package.",
  pay_later_off: "Please get a package first.",
  package_frozen: "Your package is frozen on that date. You can book classes before or after the freeze.",
  not_free: "This event isn't free. Please refresh the page.",
  event_no_cancel: "Events can't be cancelled or refunded in the app. Please message the studio.",
  private_class: "Private sessions are booked with the studio. Message us and we'll find a time that suits you.",
  clients_only: "This event is for Re·Form clients. Come to a class or get a package to join the next one.",
  waitlist_first: "This spot is going to someone on the waitlist first. Join the waitlist and we'll let you know if it opens up.",
  code_used_up: "That code has been used up.",
  code_invalid: "That code isn't valid.",
  not_a_package: "That's a single class, not a package, so it can't be marked paid as one. Remove the request instead.",
  type_locked: "Clients are booked into this class, so its class type can't change. Cancel it and create a new class instead.",
  capacity_below_booked: "More people are booked than that, so capacity can't go that low.",
  moved_outside_package: "A booked client's package doesn't cover the new date (it ends earlier, or it's frozen then). Remove them first, or adjust their package.",
  class_not_started: "This class hasn't started yet. To take someone off it, use Remove.",
  // Package adjustments (Adjust package on the client page).
  reason_required: "Please add a reason (it's kept in the client's history).",
  bad_days: "Enter a number of days between 1 and 365.",
  bad_date: "Pick a date from today on.",
  booked_in_freeze: "They're booked into classes during those dates with this package. Cancel those first.",
  no_end_date: "These classes have no end date, so there is nothing to extend.",
  booked_after: "They're booked into classes after that date with this package. Cancel those first.",
  bad_credits: "Enter between 1 and 50 classes.",
  not_enough_credits: "They don't have that many classes left in this package.",
  // Everything else the database can refuse (A-054: every raise code has words).
  online_payments_off: "Online payment isn't available yet. Reserve and pay at the studio.",
  bad_mode: "That way of booking isn't available here. Please refresh the page.",
  bad_action: "That change isn't available. Please refresh the page.",
  name_required: "Please add a name.",
  health_consent_required: "Please tick the health consent to save your answers, or choose to tell your instructor in person.",
  invalid_health_mode: "Please choose one of the options.",
  profile_not_found: "We couldn't find that client. Please refresh and try again.",
  // App-side failures (A-019, A-055).
  save_failed: "That didn't save. Please try again.",
  db_unavailable: "We can't reach the studio's system right now. Please try again in a moment.",
  unknown_class_type: "One of the class times uses a class type that no longer exists. Please refresh and check the timetable.",
};

/** Engine error codes that have their own message. */
export const ERROR_KEYS: Record<string, true> = Object.fromEntries(Object.keys(MESSAGES).map((k) => [k, true]));

export function friendlyError(e: unknown): string {
  const msg = typeof e === "object" && e && "message" in e ? String((e as { message: string }).message) : String(e);
  if (msg.includes("payments_one_code_per_client")) return "You've already used this code.";
  if (msg.includes("payments_one_pending_request")) return "You've already requested this package. It's waiting under My classes.";
  return MESSAGES[msg] ?? "Something went wrong. Please try again.";
}

/** The friendly words for one engine code (or null when it has none). */
export const messageFor = (key: string): string | null => MESSAGES[key] ?? null;

type DbResult = { error: { message: string; code?: string } | null };

/**
 * A-019/A-054: every write checks its result. Throws an Error whose message is the engine code when it has
 * words, else `save_failed` (the real error is logged on the server, never shown).
 */
export function must<T extends DbResult>(res: T, what = "write"): T {
  if (res.error) {
    console.error(`${what} failed`, res.error);
    const err = new Error(res.error.message in MESSAGES ? res.error.message : "save_failed");
    (err as Error & { cause?: unknown }).cause = res.error;
    throw err;
  }
  return res;
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
