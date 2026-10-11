import { BottomNav } from "@/components/BottomNav";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { getViewer } from "@/lib/auth";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <Header signedIn={!!viewer} isAdmin={viewer?.profile.role === "admin"} />
      <main id="main" className="mx-auto max-w-xl">
        {children}
        <Footer />
      </main>
      <BottomNav />
    </>
  );
}
