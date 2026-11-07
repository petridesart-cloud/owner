import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getViewer } from "@/lib/auth";
import { landing } from "@/lib/auth-flow";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; why?: string }> }) {
  const { next = "/", why } = await searchParams;
  const viewer = await getViewer();
  if (viewer) redirect(landing(viewer.profile, next));
  return (
    <div className="px-5 pt-8">
      <div className="card animate-rise mx-auto max-w-md px-6 pb-8 pt-7">
        <div className="flex justify-center"><Logo size={64} decorative /></div>
        <h1 className="display mt-4 text-center text-[1.5rem] text-ink">Create account</h1>
        <p className="mx-auto mt-2 max-w-xs text-center text-sm leading-relaxed text-ink-soft">{why === "package" ? "Sign in or create an account to request your package." : "A few details once, then you can book in a tap."}</p>
        <div className="mt-6"><SignupForm next={next} /></div>
      </div>
    </div>
  );
}
