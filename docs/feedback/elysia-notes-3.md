# Elysia's notes, round 3

Her answers to the round-2 questions were already built and live: clients-only events for active package holders plus the people she adds, no cancelling events, The Studio as title, photos, then text, and no details at all for people who can't see an event.

| # | Note | Priority | Status |
|---|---|---|---|
| 1 | Home: remove the "Book your classes: pick classes / every week" box; keep "Book the same days every week" under the package in My classes | Medium | Done |
| 2 | The Studio page: remove "Secure your package" | Low | Done |
| 3 | Waitlist message: "You're 1st on the waitlist. If a spot opens, we'll book you in using a credit from your package and email you." | Medium | Done (1st, 2nd, 3rd…) |
| 4 | Waitlist: nobody is moved in during the last hour before class | **High** (her rule) | Done |
| 5 | Package names everywhere: "Reformer · 8 classes · 1 month" (not "2 per week") | **High** | Done |
| 6 | A Reformer package can't book Mat, but Mat classes stay visible | Medium | It already worked; the class page now explains it |
| 7 | Is the package and class history still there? | – | Yes: My classes → past packages (with X of Y); the studio sees the full history on each client's page |
| 8 | Birthday cake and an editable birthday email | Medium | Already built; the demo now always has a birthday (Sofia) so she can see it |
| 9 | Stats: "51 of 82" for bookings; fill rate as a percentage only | Low | Done |
| 10 | Settings: full name Elysia Stephani | **High** (legal) | Done on both apps |
| 11 | SMS for the waiting list | Medium | The switch is on; texts start once an SMS account is connected (paid, see below) |

## How the waitlist works now
- **More than 1 hour before class:** a spot opens, the first person in line with a class left in their package is booked in, and they get an email (and a text once SMS is on).
- **Added safeguard:** if they're booked in less than 6 hours before class, they couldn't have planned for it. So they get 30 minutes to cancel for free (never past the last hour); the email tells them until when.
- **Without a package class (or for events):** the spot is held for them for 2 hours, at most until the last hour before class.
- **In the last hour:** nobody is moved in. The "Waitlist stops" setting (60 minutes) is in Settings.

## SMS (needs a decision)
Texts go through Twilio, a paid service: roughly €0.05–0.10 per text to Cypriot numbers, no monthly fee on pay-as-you-go. The app is ready. To switch it on, someone creates a Twilio account, buys a sender number or name, and adds three keys to the real app in Vercel. Until then, waitlist messages go by email only.

## Also fixed this round
- **Demo setup:** on some dates the demo data couldn't load ("Reset demo data" failed). Fixed.

## Open questions for Elysia
1. **Grace period:** is 30 minutes to cancel for free after a late waitlist booking OK?
2. **SMS:** go ahead with Twilio (paid per text)?
