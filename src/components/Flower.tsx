// The little six-petal flower bullet from the studio's story highlights.
export function Flower({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.15">
      {[0, 60, 120, 180, 240, 300].map((r) => (
        <ellipse key={r} cx="12" cy="6.6" rx="2.6" ry="4.6" transform={`rotate(${r} 12 12)`} />
      ))}
      <circle cx="12" cy="12" r="1.6" />
    </svg>
  );
}
