# Elysia's notes, round 4: build prompts

Each note below is rewritten as a build prompt in her words, followed by what she most likely wants.

## 1. Sign in with a password; create an account once (**High**)
> "Every time someone signs in they receive an email… Sign in with a password they set and can use every time… Forgot password reset by email… Create account: Name, Surname, Date of birth, email, phone number, password, confirm password… most phones auto-save passwords."

**Prompt:** Replace the email-code sign-in with:
- **Sign in:** email and password.
- **Forgot password:** emails a code; the client enters it and sets a new password.
- **Create account:** first name, surname, date of birth (18+), email, phone, password and confirm password, plus the Studio Rules and health declarations and photo consent. The email is confirmed once with a code, then the health questions follow.
- **Password managers:** fields carry the right autofill hints so phones save and fill passwords.
- **Where it appears:** Sign in / Create account stays on My classes, Account and package requests.

**Analysis:**
- **Email, not full name, to sign in:** two clients can share a name, and phones autofill email + password together.
- **One email check when the account is created:** without it, anyone could open an account with someone else's email and receive their receipts.
- **Existing accounts (made with codes):** the client taps "Forgot password" once to set a password.

## 2. Studio owner signs in directly to the studio (**High**)
> "Why do I have to sign in as a client to then sign in as studio owner… sign in with my email and password… directly have the studio view… with an option on the top right to view app as a client."

**Prompt:** There's one sign-in page. Studio team members always land on the studio (Today) after signing in. "View app ↗" (top right) opens the client view, where a "Studio" button leads back. The footer has a small "Studio sign-in" link. Elysia sets her password with "Forgot password" the first time.

## 3. Events: public, free, extra details (**High**)
> "What happens when they try to book a public event?… option for non-existing clients to complete some details… if I price it at 0 euros don't ask about payment method."

**Prompt:**
- **Public events:** anyone can see them; to book, people sign in or create an account (as with packages), then come back to the event.
- **Free events (€0):** booked in one tap, no payment question.
- **Per-event question (optional):** e.g. "Any dietary requirements?". People booking answer it, and the answers show in her list.
- **Adding someone by hand:** first name, surname, phone, email, a note, and payment as paid, not paid yet (she marks it later) or free.

## 4. Home page (**High**)
> "Event at the bottom… all the details are visible… privacy should also apply there… I don't like the bubbles… same design as Secure your package, text in the middle… lavender… upcoming event before Next available, only when there is one."

**Prompt:**
- **Buttons:** Studio · Events · Rules & policies become three lavender pill buttons side by side, text centred, no photos.
- **Upcoming event:** the next event shows above "Next available", only when there is one. Clients-only events show as a blurred "Clients only" card with no details for people who can't see them.
- **"Special event"** becomes "Event" everywhere.

## 5. My classes (**Medium**)
> "Book the same days every week is confusing… if I have 2 active packages… add it only when you tap on the package you want, under the details of the purple square."

**Prompt:** Remove it from the top of My classes. Show it inside each package's page, under the package details, for that package's class type (Reformer or Mat).

## 6. Studio side (**Medium**)
- **Birthday cake:** not coloured.
- **Stats history:** at the bottom, a drop-down per year opens a board of all the months; she picks what it shows (revenue, packages sold, fill rate, bookings, new clients). A month drop-down shows one month's numbers (bookings, fill rate, revenue, new clients, Reformer vs Mat).
- **Settings:** each section collapses (Your studio, How clients pay, Booking rules, Message on every page, Advanced, Class types, Packages).
- **Photos:** the buttons no longer show photos; photos appear on the Studio and Events pages.
- **Class types:**
  - No price (prices come from packages, trials and drop-ins).
  - Events have no credits, capacity, minutes or price: those are set on each event.
  - Explained on the page: a class type is what shows on the schedule and in the timetable (e.g. "Pre-natal"), and which package pays for it.
- **Packages:** only the package list (no separate price grid), plus "Add a package".
- **Event price €0:** free (see 3).

## 7. Her answers
| Question | Answer | Change |
|---|---|---|
| 30 minutes to cancel free after a late waitlist booking | No | Removed |
| SMS for the waitlist | Not yet | Switched off (email only) |
| Unpaid trial = active client? | No | Active = paid: a package with classes left, or a paid / free / studio-added class coming up |
| Freeze stops bookings? | Yes, during the freeze only | A freeze has a From–To date; no bookings with that package in between; the end date moves by the same days |
| Birthday wording | OK, she'll edit it | No change |
| Not-marked classes | Keep "Not marked", but editable | Every past class can be set to Attended / No-show / Not marked at any time |
| Under 18 | 18 or over only | Date of birth must be 18+ |

## 8. Rewards and discount codes (**Medium**)
> "Add coupons to clients or discount codes… random challenges… 10% off or a free session on their next package."

**Prompt:**
- **On a client's page, "Give a reward":** % off their next package, € off, or free classes added to their next package; optional expiry and a reason.
- **Under Clients, "Discount codes":** codes like SUMMER10 (% or € off, optional end date, optional limit on uses).
- **For the client:** rewards appear on the Packages page to apply, and there's a "Have a code?" field.
- **Pricing rules:**
  - A % or € reward replaces the student discount when it's bigger (they don't stack).
  - Free classes are added on top.
  - Applied to package requests; used up when she marks the package paid.
  - If the request expires, the reward is free again.
