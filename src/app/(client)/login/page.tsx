import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getViewer } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/" } = await searchParams;
  const viewer = await getViewer();
  if (viewer) redirect(viewer.profile.role === "admin" && next === "/" ? "/admin" : viewer.profile.onboarded_at || viewer.profile.role === "admin" ? next : `/welcome?next=${encodeURIComponent(next)}`);
  return (
    <div className="px-5 pt-8">
      <div className="card animate-rise mx-auto max-w-md px-6 pb-8 pt-7">
        <div className="flex justify-center"><Logo size={72} decorative /></div>
        <h1 className="display mt-4 text-center text-[1.5rem] text-ink">Welcome</h1>
        <p className="mx-auto mt-2 max-w-xs text-center text-sm leading-relaxed text-ink-soft">
          Sign in or create your account with just your email.
        </p>
        <div className="mt-6"><LoginForm next={next} /></div>
      </div>
    </div>
  );
}
