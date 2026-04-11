import { cn } from '@/utils/cn'

interface SkeletonProps {
  className?: string
}

export default function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('animate-pulse rounded-xl bg-gray-200/80 dark:bg-slate-700/80', className)} />
}
