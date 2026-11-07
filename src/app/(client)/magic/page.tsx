import { notFound } from "next/navigation";

// "The Magic" was removed from the app (her notes, round 2) and nothing links to it any more: not found (A-106).
export default function MagicPage() {
  notFound();
}
