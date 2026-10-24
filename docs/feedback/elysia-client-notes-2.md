# Elysia's client notes, round 2

Her notes are about the client side. Each item has a priority, what was built, and any open question.

| # | Note | Priority | Status |
|---|---|---|---|
| 1 | Health questions: tick-list first, then a "Next" page for details, pregnancy follow-up, doctor's-note disclaimers, blood-pressure/heart medication | **High** (safety) | Done |
| 2 | Package terms: add the 6h cancellation rule | **High** (policy clarity) | Done |
| 3 | Packages one per line: "4 classes · €70" with small "4 credits", grouped "Reformer packages, valid 30 days" | Medium | Done (euro, not £) |
| 4 | Remove "Arrive 5–10 minutes early, grip socks on" from the booking confirmation | Low | Done (also removed from the confirmation email) |
| 5 | Schedule / home: no colour strip on the left; colour only on the spots badge | Low | Done |
| 6 | Account: drop-down sections (Your details, Health, Receipts, Privacy & data) | Medium | Done |
| 7 | Remove the "PAR-Q" label | Low | Done |
| 8 | Studio page: title "The Studio", no area names, her photos plus optional text | Medium | Done |
| 9 | Events: optional intro, "Upcoming events", her own background picture, date/title/description/location/price/spots, "3 of N spots", optional What to bring, own terms per event, clients-only events (blurred), archive with sliding photos and her own words | **High** (she runs events) | Done |
| 10 | Clients-only events unavailable on the Schedule for others | Medium | Done |

## What was built

### Health questions (Account → Health, and at sign-up)
- **Step 1** is her checklist, plus "No injuries or medical conditions", which clears the rest when picked.
  - Her two "Other" options are merged into one: "Other injuries or conditions".
  - Added: "Chest pain, dizziness or fainting". It's a standard pre-exercise screening question, worth keeping now that the heart questions are shorter.
- **Step 2** ("Next") asks:
  - for written details;
  - about pregnancy, if ticked: now → how many weeks; in the past → how long ago;
  - whether they take medication that affects blood pressure or the heart;
  - about any other medication.
- **Doctor's note.** If the client is currently pregnant, gave birth 3 months ago or less, or had recent surgery, the app asks them to bring a written note from their doctor. Her roster flags "Doctor's note needed" until she taps **Doctor's note received** on the client page.
- **What "PAR-Q" means.** PAR-Q stands for *Physical Activity Readiness Questionnaire*, the standard pre-exercise health screening. It isn't a legal requirement in Cyprus or the EU, so the label is gone. Keeping a health screening is still good practice (and insurers often expect one).
- **Consent.** Saving any health answer needs the separate health-data consent tick (GDPR special-category data). Choosing "No injuries or medical conditions" stores nothing except the date answered. *To confirm in the legal review.*

### Events (Classes → New class → Special Event, then the event's page)
- **Fields she can edit:** title, date and time, length, location, description, price (event fee) and spots.
- **Event options:**
  - **Clients only**, explained under Open questions.
  - **What to bring**: leave it empty to hide the section.
  - **Event terms**: shown on the event and in the booking emails instead of the studio cancellation policy.
  - **After the event**: her few words for the archive.
- **Event photos:**
  - A **background picture**, shown on the Events page with the details on a frosted panel so the text stays readable. Without a picture, the soft gradient is used.
  - **Photos for Previous events**, which slide one after another.
- **Events intro:** Settings → Your texts. Leave it empty to hide it.
- **Previous events** lists past events she has added photos or words to.

### Studio page
- One gallery of her photos that slides sideways, and optional text above it (Settings → Your texts; leave it empty to show only photos).
- Photos go in Settings → Photos → The Studio.
- The old "Studio page sections" setting is removed.

## Her answers (and what changed)
- **Who counts as a client:** clients with an **active package** (classes left, not ended); trials and drop-ins don't count. She can also let specific people see and book a clients-only event (event page → "Who can see this event"). Anyone already booked keeps access.
- **Event cancellations:** clients can't cancel or get refunds for events in the app (they're told to message the studio); she can still remove someone herself. Without her own terms, events show "Events can't be cancelled or refunded in the app."
- **The Studio page:** title, then her photos, then her text. What to bring, The Magic and the map were removed (their settings are hidden; nothing was deleted).
- **Clients-only details:** people who can't see the event get a blurred "Clients only" card with no details at all, also from a direct link; on the Schedule it shows as "Special event · Clients only" and can't be tapped.
- **Events page title:** just "Events".

## Open questions for Elysia (answered above)
1. **Who counts as a client for clients-only events?** The default is anyone who has paid for something, been given classes, or come to a class. Should a booked trial count before it happens?
2. **Event cancellations.** The app shows her own terms, but cancelling in the app still follows the 6h rule (free release before 6h). Do events need their own cutoff, e.g. 48h? It's a small addition if yes.
3. **Studio text above or below the photos?** It's above for now.
4. **Clients-only event details.** The Events page blurs them. Someone with the direct link can read the details but can't book. Is that OK?
