// Photos for social media: her three options.
export const PHOTO_CONSENT = { face: "Yes, with my face", no_face: "Yes, without my face", none: "No photos of me" } as const;
export type PhotoConsent = keyof typeof PHOTO_CONSENT;
