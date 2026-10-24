# Elysia's studio (admin) notes, round 1

Her notes on the studio side. Each item has a priority, what was built, and any open question.

| # | Note | Priority | Status |
|---|---|---|---|
| 1 | Back button on every studio page | **High** (navigation) | Done (all pages except Today) |
| 2 | Classes: days in a swipeable row like the client Schedule; tap a day to see its classes (time, type, booked) | **High** (daily use) | Done |
| 3 | Class page: "Clients" instead of "Roster"; photo flags on the second line; health heart with facts only, no tips | Medium | Done |
| 4 | Timetable repeats every month by itself | **High** (saves her time) | Done |
| 5 | "Add a closure" as a drop-down | Low | Done |
| 6 | Clients: Active and Not active sections, alphabetical, name + phone | **High** | Done |
| 7 | Birthday cake on the day, with a birthday email she can change | Medium | Done |
| 8 | Client page: phone first; Packages / Attended / No-shows boxes (Reformer above Mat) | **High** | Done |
| 9 | Current package: type, classes, paid how much and when, start and end, used / attended / missed | **High** | Done |
| 10 | Details & notes together (Birthday, emergency contact with relation, photos, goal, notes last) | Medium | Done; clients can now add the relation in Account |
| 11 | Health: date answered, details, every update kept (newest first, older in a drop-down) | **High** (safety) | Done |
| 12 | Student: empty unless it applies; does it give the discount? | Low | Done; yes, see below |
| 13 | Remove "Missed class: public holiday" | Low | Done (use Adjust package → Give classes) |
| 14 | Adjust package: extend, freeze, end earlier, add classes (to the package or with their own end date), remove classes | **High** | Done |
| 15 | Class ledger, Payments, History as drop-downs; History grouped by package with each class's outcome and a summary | Medium | Done |
| 16 | Stats: weekly and monthly (revenue, new clients), "of N spots" beside the number, Reformer vs Mat, fill rate by day, payments by method | Medium | Done |

## How it works

### Classes
- **Day strip:** swipe through two weeks back and eight weeks ahead.
  - The page opens on the next day that has classes.
  - Each class shows its time, type and how many are booked. Tap it for details.
- **Monthly timetable:** set it once with a start date and it repeats every week, month after month.
  - The app keeps classes ready about 9 weeks ahead (checked every 5 minutes).
  - Change a single class in Classes.
  - To change the weekly pattern, edit the times and save with a new start date. The old pattern stops from that date: its empty classes are removed, and any class with someone booked or waiting is kept and counted in the message.
  - Classes are never created on confirmed closure days.

### Clients
- **Active:** a package with classes left that hasn't ended, or a trial, drop-in or event coming up.
- **Not active:** everyone else who is signed up. A deleted account disappears from both lists.
- **Birthday:** on a client's birthday a cake shows on their row and their page. The page has a birthday email with words she can change; it can be sent once a year per client.
- **No-shows:** booked and didn't come, or cancelled less than 6 hours before (the class was used).
- **Attended** counts the classes she marked as attended. Past classes she didn't mark show as "Not marked" in History.
- **Health:** every time a client saves their answers, a copy is kept. Only she can see them, and they are deleted with the account. Health notes state the facts only; the app never suggests what to do.
- **Student:** leave the date empty if they're not a student. With a date, they get 10% off group packages automatically until that date.
- **Adjust package:**
  - **Extend:** adds days to the package.
  - **Freeze:** moves the end date by the frozen days, recorded as a freeze.
  - **End earlier:** not allowed while they're booked after that date.
  - **Add or remove classes** on that package; added classes expire with it.
  - **Give classes:** classes outside their packages, with their own end date, e.g. for a missed public-holiday class.

  Every change, with its reason, goes in the class ledger.
- **History:**
  - Each package, trial, drop-in and event as its own entry; classes the studio added by hand are one entry per type.
  - Open an entry to see what was paid and when, how long it ran, a summary (attended, missed, cancelled), and each class: Attended, No-show, Cancelled late (not refunded), Cancelled (refunded), Booked, Not marked.

### Stats
- **What "Monthly recurring" was:** income from auto-renewing monthly memberships. That feature is switched off (packages are bought one at a time), so it always showed €0 and has been removed.
- **"Classes this month: 3 used / 2 expired unused"** is now called **Package classes**: classes taken from clients' packages this month, and package classes that reached their end date unused.

## Open questions for Elysia
1. **Active clients:** should someone with an unpaid trial booked count as active (it does now)?
2. **Freeze:** should a frozen package also stop bookings during the freeze? Today it only moves the end date.
3. **Birthday email:** is the default wording OK?
4. **Attended:** should past classes she didn't mark count as attended automatically after the day?
