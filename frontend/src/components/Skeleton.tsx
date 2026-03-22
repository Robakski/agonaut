/**
 * Reusable skeleton loading components.
 * Shimmer animation matching the site's slate palette.
 */

export function SkeletonBox({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-slate-100 rounded-xl animate-pulse ${className}`}
    />
  );
}

export function SkeletonStatRow({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <SkeletonBox className="h-2.5 w-12 mb-2" />
          <SkeletonBox className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="bg-slate-50 px-6 py-3">
        <SkeletonBox className="h-3 w-48" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4 border-t border-slate-50">
          <SkeletonBox className="h-4 w-32" />
          <SkeletonBox className="h-4 w-16 ml-auto" />
          <SkeletonBox className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <SkeletonBox className="h-7 w-48 mb-2" />
          <SkeletonBox className="h-4 w-32" />
        </div>
        <SkeletonBox className="h-10 w-36 rounded-xl" />
      </div>
      {/* Stats */}
      <SkeletonStatRow />
      {/* Table */}
      <div>
        <SkeletonBox className="h-4 w-32 mb-4" />
        <SkeletonTable />
      </div>
    </div>
  );
}
