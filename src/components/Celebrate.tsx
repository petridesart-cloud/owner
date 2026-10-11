// Calm confirmation moment: checkmark draws, a lilac ripple expands, a few petals drift.
// Pure CSS; prefers-reduced-motion collapses it to a static check (see globals.css).
export function Celebrate() {
  const petals = [
    { x: -70, d: 0, r: -30 }, { x: 60, d: 90, r: 40 }, { x: -30, d: 160, r: 15 }, { x: 85, d: 220, r: -20 }, { x: -95, d: 260, r: 60 },
  ];
  return (
    <div className="relative mx-auto grid size-28 place-items-center" aria-hidden>
      <span className="celebrate-ripple absolute inset-0 rounded-full bg-lilac-300/50" />
      <span className="celebrate-ripple absolute inset-0 rounded-full bg-mauve/40 [animation-delay:180ms]" />
      {petals.map((p, i) => (
        <span key={i} className="celebrate-petal absolute left-1/2 top-1/2 h-3 w-2 rounded-[60%_40%_60%_40%] bg-gradient-to-b from-mauve to-lilac-300"
          style={{ ["--x" as string]: `${p.x}px`, ["--r" as string]: `${p.r}deg`, animationDelay: `${350 + p.d}ms` }} />
      ))}
      <svg viewBox="0 0 80 80" className="celebrate-pop relative size-20 drop-shadow-[0_10px_24px_rgb(46_34_56/0.25)]">
        <defs>
          <linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#C9A8E6" /><stop offset="1" stopColor="#D7A3C8" /></linearGradient>
        </defs>
        <circle cx="40" cy="40" r="38" fill="url(#cg)" />
        <path className="celebrate-check" d="M25 41 l10 10 l20 -22" fill="none" stroke="#2E2238" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
