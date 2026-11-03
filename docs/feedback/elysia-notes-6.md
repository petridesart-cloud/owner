# Elysia's notes, round 6: her packages, tabs, private sessions and timetable

## Her questions
| Question | Answer |
|---|---|
| "Add a client": if 2 spots are free and I add a 3rd person, can someone else still book (4 people)? | No. Someone she adds takes a spot like anyone else; a full class stays full (the engine refuses `full` for her too). To fit an extra person she raises the spots first (Edit class). Adding someone herself only skips the client rules: the booking window, the 6h cutoff, clients-only events and private sessions. The guide now says this plainly. |
| Can I change how far ahead spots open (1 month, 3 months)? | Yes: Settings → Booking rules → "Clients can book (weeks ahead)" (4 ≈ 1 month, 13 = 3 months, up to 26). The "9 weeks" was how far ahead classes are created; it now follows her setting (at least 2 weeks beyond it, never less than 9). |

## Build prompts
1. **Packages page tabs (High).** After "Secure your package" clients choose a tab (Mat, Reformer, Pre and Post Natal, Private); everything else is inside the tab. A tab can hold several class types, each with a heading and description (e.g. Private → Mat / Reformer / Pre & Post Natal · Mat / Pre & Post Natal · Reformer based). Settings → Packages page: tab name, order, note at the top, "Show this tab to clients", and per class type its heading, description and tab.
2. **Hidden until she's ready (High).** Pre and Post Natal and Private are fully set up but hidden. Only she sees them (marked "· hidden", with a notice). Requests from a hidden tab are refused on the server.
3. **Private sessions (High).** A class type can be "Private": never on the schedule, never booked online (database trigger), and the waitlist is off. She books clients in by hand with their private package classes. The Private tab note says times are arranged together after buying.
4. **Her packages (data, both apps).**
   - **Mat:** 4, 8, 12 classes for 1 month (€50, €90, €120) and for 2 months (€85, €150, €200). Trial €20, drop-in €30.
   - **Reformer:** 4, 8, 12 classes for 1 month (€70, €130, €180) and for 2 months (€120, €230, €300). Trial €25, drop-in €35.
   - The packages she no longer sells come off sale and are archived (kept for anyone who bought them).
   - **Pre and Post Natal:**
     - Mat: 4 or 8 classes for 1 month (€50, €90); trial €20, drop-in €30.
     - Reformer: 4 or 8 classes for 1 month (€70, €130); trial €25, drop-in €35.
   - **Private:** 1, 4 or 8 classes for 1 month.
     - Mat: €40, €140, €240.
     - Reformer: €50, €180, €320.
     - Pre & Post Natal Mat: €40, €140, €240.
     - Pre & Post Natal Reformer based: €50, €180, €320.
     - Her descriptions are on the Pre & Post Natal ones.
     - No student discount on privates.
5. **Her timetable (real app only).** Loaded as the repeating weekly timetable on the real studio app (it had none); the demo keeps its practice timetable. 32 classes a week:
   - Monday: 8:00 R, 9:00 R, 16:30 Mat, 17:30 R, 18:30 R, 19:30 R.
   - Tuesday: 7:00 R, 8:00 R, 9:00 Mat, 16:00 R, 17:00 R, 18:00 R, 19:00 R.
   - Wednesday: 7:30 R, 8:30 R, 9:30 Mat, 16:00 R, 17:00 R.
   - Thursday: as Monday.
   - Friday: 7:00 Mat, 8:00 R, 9:00 Mat, 16:00 R, 17:00 R, 18:00 R, 19:00 R.
   - Saturday: 8:00 R.

## Open questions
- ~~Mat class size~~ **Answered:** Mat classes have 4 spots (Mat and Pre & Post Natal Mat), migration `20261103000300_mat_four_spots.sql`; scheduled Mat classes changed to 4 (never below who's already booked).
- **Pre & Post Natal classes:** they aren't in the timetable yet. She adds them when she launches the tab.
