import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "soft" | "ghost" | "danger";
const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[0.8rem] font-medium uppercase tracking-[0.18em] transition duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper shadow-[0_10px_30px_-10px_rgb(46_34_56/0.6)] hover:bg-plum-700",
  soft: "bg-lilac-100 text-ink hover:bg-lilac-200",
  ghost: "border border-ink/15 bg-white/60 text-ink hover:bg-white",
  danger: "border border-burgundy/30 bg-white text-burgundy hover:bg-burgundy-soft",
};

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function ButtonLink({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

export function PageTitle({ eyebrow, title, script, children }: { eyebrow?: string; title: string; script?: string; children?: ReactNode }) {
  return (
    <header className="animate-rise px-5 pb-4 pt-6">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 className="display mt-2 text-[1.9rem] text-ink">
        {script && <span className="mr-2 font-script text-[2.3rem] normal-case tracking-normal text-plum-700">{script}</span>}
        {title}
      </h1>
      {children && <div className="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">{children}</div>}
    </header>
  );
}

export function Badge({ tone = "lilac", children }: { tone?: "lilac" | "full" | "mauve" | "plain"; children: ReactNode }) {
  const tones = {
    lilac: "bg-lilac-100 text-ink",
    full: "bg-burgundy-soft text-burgundy",
    mauve: "bg-mauve-soft text-ink",
    plain: "bg-white text-ink-soft border border-line",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.7rem] font-medium tracking-wide ${tones[tone]}`}>{children}</span>;
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`card ${className}`} {...props} />;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  const tones = { info: "bg-lilac-50 border-lilac-200", error: "bg-burgundy-soft border-burgundy/25 text-burgundy", success: "bg-mauve-soft border-mauve/40" };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Field({
  label, hint, error, id, children,
}: { label: string; hint?: ReactNode; error?: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs leading-relaxed text-ink-soft">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-xs font-medium text-burgundy">{error}</p>}
    </div>
  );
}

export const inputClass =
  "block min-h-12 w-full rounded-2xl border border-line bg-white px-4 text-base text-ink placeholder:text-ink-soft/70 shadow-[inset_0_1px_2px_rgb(46_34_56/0.04)] transition focus:border-plum-700 focus:outline-none focus:ring-2 focus:ring-lilac-300 aria-[invalid=true]:border-burgundy";

export function Checkbox({ id, children, ...props }: ComponentProps<"input"> & { id: string; children: ReactNode }) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl py-1.5 text-sm leading-relaxed text-ink">
      <input id={id} type="checkbox" className="mt-0.5 size-5 shrink-0 rounded-md border-line accent-ink" {...props} />
      <span>{children}</span>
    </label>
  );
}

export function Section({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`px-5 ${className}`}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="display text-[1.05rem] text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
