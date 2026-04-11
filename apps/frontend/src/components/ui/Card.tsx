import { cn } from '@/utils/cn'
import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
  subtitle?: string
  action?: ReactNode
}

export default function Card({ children, className, title, subtitle, action }: CardProps) {
  return (
    <div
      className={cn(
        'glass-panel density-pad rounded-2xl ring-1 ring-sky-100/80 transition-all duration-200 hover:shadow-[0_20px_38px_-28px_rgba(2,132,199,0.85)] dark:ring-slate-700',
        className,
      )}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-5">
          <div>
            {title && <h3 className="text-lg font-semibold tracking-tight text-slate-800 dark:text-white">{title}</h3>}
            {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
