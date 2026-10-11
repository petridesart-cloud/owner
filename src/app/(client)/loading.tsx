// Skeleton matching the page header + card list, so nothing jumps when content arrives.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="px-5 pt-6">
      <div className="skeleton h-3 w-24" />
      <div className="skeleton mt-3 h-8 w-48" />
      <div className="skeleton mt-3 h-4 w-64" />
      <div className="mt-6 space-y-2.5">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-[76px]" />)}
      </div>
    </div>
  );
}
