# Hardening fix log (Phase 4)

| ID | Sev | Fix | Test(s) | Commit |
|---|---|---|---|---|
| A-002 | Critical | Logins linked to profiles only after the email is proven (new `handle_user_confirmed`; insert links nothing); Studio-team invites in `team_invites`, admin granted only on a code-checked sign-in; `config.toml` mirrors hosted settings (sign-up off, confirm on, secure password change, OTP 600 s) | `engine.test.ts` "account linking" (unconfirmed / pre-confirmed logins, invites); `e2e/linking.spec.ts` (imported client linked after confirm; outside login gets neither) | A-002, A-008: link logins to client records only once the email is proven; exact email lookups |
| A-008 | High | `ilike` email lookups replaced by exact lower-case equality (`normEmail`); stored emails lower-cased, trigger keeps them so | `engine.test.ts` "_ and % in an email"; `e2e/linking.spec.ts` "underscore" | A-002, A-008: link logins to client records only once the email is proven; exact email lookups |
