# Elysia's notes on the client app, round 1 (24 Oct 2026)

Her notes, rewritten as clear build instructions. Gaps are filled with sensible defaults; anything that needs her decision is under **Questions** at the end. Prices are her real prices, in **euro** (she wrote $).

---

## 1. Home

**1.1 Logo.** Use her Instagram logo: the lilac circle with "Re·Form" and the swash on the m. For now it's cut from her Instagram profile; replace it with the original high-resolution file when she sends it.

**1.2 Remove the line under the logo.** Delete "Pilates studio · Limassol, Cyprus"; the footer already says where the studio is.

**1.3 Main button: "Secure your package".** It replaces "Secure your spot". Tapping it opens the Packages page with every option:

| | 1 per week | 2 per week | 3 per week | 4 per week |
|---|---|---|---|---|
| **Reformer, 1 month** (4 / 8 / 12 / 16 classes) | €70 | €130 | €180 | €220 |
| **Reformer, 2 months** (8 / 16 / 24 / 32 classes) | €120 | €240 | €300 | €410 |
| **Mat, 1 month** | €50 | €90 | €120 | €150 |
| **Mat, 2 months** | €85 | €150 | €200 | €260 |

- **Reformer Trial €25** and **Mat Trial €20**: only for someone booking that type of class for the first time.
- **Reformer Drop-in €35** and **Mat Drop-in €30**: a single class, paid individually.
- "1 month" = valid 30 days from the first class; "2 months" = 60 days (her policy).
- Number of classes = classes per week × 4 per month (e.g. 2 per week for 1 month = 8 classes).

**1.4 Choosing how to pay.** When requesting a package, the client chooses **Cash** or **Revolut** (plus bank transfer if she adds an IBAN). Revolut shows her Revolut link. The package shows "awaiting payment" until she marks it paid in the studio app; then the classes appear.

**1.5 Two ways to book with a package:**
- **Book manually**: pick classes one by one from the schedule.
- **Same days and times every week**: e.g. every Monday 16:30 and Wednesday 19:00. The app books those classes every week until the package runs out or expires, within the 4-week booking window, and keeps booking new weeks as they open. If a weekly class is full, it's skipped, the client is told, and they get a one-tap option to join the waitlist.

**1.6 "Your next class".** Keep it as it is: "in 3 days", the day and date, class type, time, and Add to calendar.

**1.7 The circles.** Replace Schedule / Our Studio / The Magic / Policy with three:
- **Studio:** photos of the space, in sections she controls: Reformers, Mat, Changing room, Toilet, Bathroom, Kitchen. She uploads photos herself from the studio app.
- **Events:** upcoming events (bookable) and previous events, with photos.
- **Studio rules & policies:** her Studio Rules and her Payments, Cancellation & Membership Policy on one page.

**1.8 "Next available".** Keep it. Simplify the colours to three states, used everywhere (home, schedule, class page):
- **Pink**: you're booked.
- **Purple**: spots available (e.g. "2 of 3 reformers left").
- **Light pink**: full, "Join waitlist".

## 2. Schedule

- **Month and year:** make them bigger.
- **Title:** just "Schedule" (drop the word "Class").
- **Booking window:** up to **4 weeks** ahead (was 3), as a setting she can change.
- **Cancellation:** keep the 6-hour policy text.
- **Class page:** keep it as it is (details and "classes left").

## 3. My classes

**3.1 Headings.** The small label above becomes **My profile**; under "My classes" it says **My progress**.

**3.2 Current package.** Replace the "reformer classes left / mat classes left" boxes with the package in use, for example:
> **Reformer Package**
> 2 per week · 1 month
> 13.10.2026 – 13.11.2026
> 3 classes left

- Before the first class: "Starts with your first class".
- Tapping it opens the package page: its classes so far and upcoming, with a **Back** button.
- If they hold two packages (e.g. reformer and mat), show both.

**3.3 Remove the "My package & history" and "Packages" links.** Packages live on the home page.

**3.4 Upcoming.** Keep the list with Cancel and Add to calendar. When empty, say **"No sessions booked"**.

**3.5 Past = past packages, not sessions.** Tapping a past package shows its classes:
- **Shown:** classes attended, and classes missed (no-show marked by the instructor, or cancelled inside 6 hours).
- **Not shown:** classes cancelled 6+ hours ahead, because those were rescheduled.
- **Unused classes:** if the package expired with classes left, show "2 unused (expired)".
- **Progress:** e.g. **8/8** or **6/8**, so they can look back on it.

## 4. Account

- **No packages here:** they're already in My classes.
- **Details:** first name, surname, date of birth, email, goal (optional).
- **Editable any time:**
  - Emergency contact: name and phone.
  - Injuries: yes or no, plus details.
  - Medication.
  - Photos for social media: **with face**, **without face**, or **no photos**.
- **Health info:** injuries and medication are health data. They need their own explicit consent, and only the instructor sees them.
- **Receipts:** each shows as "Reformer package · €130". Tapping one shows the receipt number, payment date, client name, package (e.g. "Reformer · 8 classes / 1 month"), price, and how it was paid (cash or Revolut).

## 5. Navigation (everywhere)

- **Logo text top-left:** "Re·Form" is just the name, not a link.
- **Top right:** remove the person icon (it duplicates the Account tab). Keep **Studio** there for the owner only.
- **Back buttons:** every page opened from another page (package details, receipt, class page, studio, events, policies) gets a **Back** button that returns one step, not to the start.

## 6. Adapted elsewhere (our additions, from her notes)

- **Studio app, Today:**
  - Show the payment method each client chose on "Awaiting payment".
  - Flag **Trial**, **Drop-in** and **First class** on the roster.
  - Flag clients who said **no photos**, so she knows before filming.
- **Studio app, Clients:** show emergency contact, photo consent and health info (behind a tap).
- **Studio app, Photos:** upload the logo, studio photos per section, and event photos.
- **Studio app, Settings:** edit package prices; booking window (4 weeks).
- **Sign-up:** first name, surname, phone and date of birth; health questions optional with consent.
- **Demo data:** her real packages; one upcoming and one past event.

---

## Status
Built on 24 Oct 2026 with the defaults below (live on the demo). Not done yet: blocking repeat trials from a new email address (v2), photo captions and reordering (v2).

## Questions for Elysia (our defaults until she answers)

1. **Prices in euro?** She wrote $. **Answered: euro.**
2. **"2 per week"**: a strict limit of 2 classes each week, or 8 classes to use within the month however they like? *Default: 8 classes within the month; "2 per week" is the guide.*
3. **Trial**: once per person per class type (one reformer trial, one mat trial)? *Default: yes, only if they've never booked that type.*
4. **Drop-in and trial payment**: the client reserves the spot and pays by cash at the studio or Revolut before class, and you mark it paid. OK? *Default: yes; unpaid ones show on your roster.*
5. **"The Magic" (about you)** isn't in the new circles. Keep it as a section at the bottom of the Studio page? *Default: yes.*
6. **Toilet and Bathroom**: separate photo sections, or one? *Default: as she wrote; she can rename or add sections herself.*
7. **Weekly repeat bookings**: if a class is full that week, should the client join the waitlist automatically? *Default: skip it and offer one-tap waitlist.*
8. **Date of birth**: required or optional? **Answered: required.** Clients who signed up before are asked for it before their next booking.
9. **Logo**: please send the original logo file (PNG or PDF, as large as possible).
10. **Under 18s** (new): do you take clients under 18? If yes, should a parent confirm at sign-up? *Default: allowed from 12; her class list shows an "Under 18" flag.*
