-- Clients can turn class reminders off (Account → Notifications). Confirmations, cancellations,
-- waitlist and sign-in codes are always sent (they're the service itself).
alter table public.profiles add column reminder_emails boolean not null default true;
