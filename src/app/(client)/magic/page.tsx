import { redirect } from "next/navigation";

// "The Magic" was removed from the app (her notes, round 2); old links go to the Studio page.
export default function MagicPage() {
  redirect("/studio");
}
