// The studio's identity (controller and trader), without server-only imports so the legal texts and their
// tests can use it. Placeholders ("[Owner full name]", hello@example.com, +357 00 000000) count as not set.
export type IdentitySettings = {
  legal_name: string; trader_name: string; address: string; contact_email: string; contact_phone: string; instagram_handle: string;
};

/** Placeholder text from the defaults ("[Owner full name]", hello@example.com, +357 00 000000). */
export const isPlaceholder = (v: string | null | undefined) => !v?.trim() || /\[.*\]|example\.(com|org)|00 000000/i.test(v);
const real = (v: string | null | undefined) => (isPlaceholder(v) ? null : v!.trim());

/** Business details for clients: placeholders become null, so they're never shown. */
export function business(s: IdentitySettings) {
  return {
    name: real(s.legal_name) ?? "Re·Form Pilates Studio",
    owner: real(s.trader_name),
    address: real(s.address),
    email: real(s.contact_email),
    phone: real(s.contact_phone),
  };
}

/** The same details for the legal texts: what isn't filled in yet stays a visible [placeholder] (A-012, A-013). */
export function identity(s: IdentitySettings) {
  const b = business(s);
  return {
    name: b.name,
    owner: b.owner ?? "[Trader full name]",
    address: b.address ?? "[Studio address, postcode, Limassol, Cyprus]",
    email: b.email ?? "[Contact email]",
    phone: b.phone ?? "[Contact phone]",
    instagram: `@${s.instagram_handle || "re_form_es"}`,
  };
}

/** Is everything a client must see before paying filled in (name, address, email, phone)? */
export const identityComplete = (s: IdentitySettings) => {
  const b = business(s);
  return !!(b.owner && b.address && b.email && b.phone);
};
