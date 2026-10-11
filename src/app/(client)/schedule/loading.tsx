export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading schedule">
      <div className="px-5 pb-4 pt-6">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton mt-3 h-9 w-56" />
        <div className="skeleton mt-3 h-4 w-72" />
      </div>
      <div className="flex gap-2 overflow-hidden border-y border-line/60 px-5 py-2.5">
        {Array.from({ length: 7 }, (_, i) => <div key={i} className="skeleton h-[68px] w-[52px] shrink-0 !rounded-2xl" />)}
      </div>
      <div className="space-y-2.5 px-5 pt-5">
        <div className="skeleton h-4 w-40" />
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-[76px]" />)}
      </div>
    </div>
  );
}
