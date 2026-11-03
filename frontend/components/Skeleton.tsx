export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`card p-5 ${className}`} aria-hidden="true">
      <div className="skeleton mb-4 h-12 w-12 rounded-2xl" />
      <div className="skeleton mb-2 h-4 w-2/3" />
      <div className="skeleton h-3 w-1/2" />
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card divide-y divide-[color:var(--line)]" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 p-4">
          <div className="skeleton h-10 w-10 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-1/3" />
            <div className="skeleton h-3 w-1/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}
