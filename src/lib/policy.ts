// The studio's own rules, in her words. Reused in the policy pages, the
// first-class welcome, the 24h reminder and the class "What to bring" section.
export const STUDIO_RULES = [
  "Arrive at the studio 5–10 minutes before your class.",
  "Wear clean, comfortable clothes, preferably form-fitting, so your instructor can see your alignment and give effective feedback.",
  "For Reformer classes, grip socks are advised for safety and hygiene.",
  "All mobile phones should be on silent and stored away.",
  "Tell your instructor about any concerns, injuries, health conditions or limitations before class.",
];

export const WHAT_TO_BRING = ["Grip socks (for reformer)", "Water", "Clean, form-fitting clothes", "Arrive 5–10 minutes early"];

export function paymentsPolicy(s: { cancellation_cutoff_hours: number; student_discount_pct: number }) {
  return [
    "All memberships are valid for 30 or 60 days from the date of your first class, depending on the package chosen.",
    "Packages and memberships are non-transferable and cannot be shared between individuals.",
    `Missed classes are non-refundable and non-replaceable.* (*${s.cancellation_cutoff_hours}h notice allows rescheduling, subject to availability.)`,
    "Classes cannot be booked for dates beyond the package expiration date.",
    "Any unused classes expire at the end of the validity period and are non-refundable.",
    "All classes and packages must be paid in advance.",
    "Payments can be made in cash, Revolut or bank transfer.",
    `Students are eligible for a ${s.student_discount_pct}% discount on all group packages with a valid student card.`,
    "Any class cancelled by me will always be replaced.",
    "Any classes missed due to a public holiday can be rescheduled upon request, subject to availability.",
    "Classes and memberships that are active during the Christmas, Easter and Summer holidays will be frozen for the days that the studio is closed.",
  ];
}
