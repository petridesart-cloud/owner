import { redirect } from "next/navigation";

// "The Magic" now lives at the bottom of the Studio page.
export default function MagicPage() {
  redirect("/studio#magic");
}
