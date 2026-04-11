import type { CSSProperties } from 'react'
import Skeleton from './Skeleton'

export function StatsCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-1 gap-4 ${count === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={`stat-${index}`} className="glass-panel density-pad">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-8 w-28" />
          <Skeleton className="mt-2 h-3 w-16" />
        </div>
      ))}
    </div>
  )
}

export function FormSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="glass-panel density-pad space-y-3">
      <Skeleton className="h-6 w-44" />
      {Array.from({ length: rows }).map((_, index) => (
        <div key={`form-${index}`} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="glass-panel density-pad overflow-hidden">
      <div className="grid gap-3">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, index) => (
            <Skeleton key={`th-${index}`} className="h-4 w-full" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`tr-${rowIndex}`} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols }).map((_, colIndex) => (
              <Skeleton key={`td-${rowIndex}-${colIndex}`} className="h-10 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <div className="glass-panel density-pad">
      <Skeleton className="h-6 w-52" />
      <Skeleton className="mt-2 h-4 w-32" />
      <div className="mt-6 flex h-72 items-end gap-3">
        {Array.from({ length: 9 }).map((_, index) => (
          <Skeleton
            key={`bar-${index}`}
            className="w-full"
            style={{ height: `${40 + ((index % 5) + 1) * 24}px` } as CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}

export function ChatSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:min-h-[calc(100vh-260px)]">
      <div className="glass-panel density-pad space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={`chat-list-${index}`} className="rounded-xl border border-gray-100 p-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2 h-3 w-16" />
            <Skeleton className="mt-2 h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="glass-panel density-pad lg:col-span-2">
        <Skeleton className="h-6 w-40" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={`chat-msg-${index}`} className={`h-16 ${index % 2 === 0 ? 'w-3/4' : 'ml-auto w-2/3'}`} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function RoutePageSkeleton({ kind = 'default' }: { kind?: 'dashboard' | 'table' | 'form' | 'reports' | 'chat' | 'default' }) {
  if (kind === 'dashboard') {
    return (
      <div className="space-y-6">
        <StatsCardsSkeleton />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      </div>
    )
  }

  if (kind === 'table') {
    return (
      <div className="space-y-6">
        <FormSkeleton rows={1} />
        <TableSkeleton cols={6} />
      </div>
    )
  }

  if (kind === 'form') {
    return (
      <div className="space-y-6">
        <FormSkeleton rows={2} />
        <TableSkeleton cols={5} />
      </div>
    )
  }

  if (kind === 'reports') {
    return (
      <div className="space-y-6">
        <StatsCardsSkeleton />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <TableSkeleton cols={5} />
      </div>
    )
  }

  if (kind === 'chat') {
    return <ChatSkeleton />
  }

  return (
    <div className="space-y-6">
      <StatsCardsSkeleton count={3} />
      <TableSkeleton cols={4} />
    </div>
  )
}
