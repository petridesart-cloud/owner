/** Shared (client + server) helpers for class-type labels. */
export type Kind = { key: string; label: string; sort: number; tab?: string | null; sub_label?: string | null; description?: string | null };
export type Tab = { key: string; label: string; note: string | null; sort: number; visible: boolean };

/** Fallback when the label isn't loaded: "reformer" → "Reformer", "pre_post_natal" → "Pre post natal". */
export const prettyKind = (key: string | null | undefined) =>
  key ? key.charAt(0).toUpperCase() + key.slice(1).replace(/_\d+$/, "").replace(/_/g, " ") : "";

export const labelOf = (labels: Record<string, string> | undefined, key: string | null | undefined) =>
  (key && labels?.[key]) || prettyKind(key);
