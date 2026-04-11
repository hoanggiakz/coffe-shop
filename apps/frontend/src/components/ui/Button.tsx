import { cn } from '@/utils/cn'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex min-h-11 min-w-[44px] items-center justify-center rounded-2xl border border-transparent font-semibold tracking-[0.01em] transition-all duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 disabled:pointer-events-none disabled:opacity-55',
        {
          'bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-[0_12px_22px_-12px_rgba(14,165,233,0.75)] hover:from-sky-600 hover:to-sky-700': variant === 'primary',
          'border-sky-200/80 bg-white/90 text-slate-700 shadow-sm hover:bg-sky-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700': variant === 'secondary',
          'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-[0_12px_22px_-12px_rgba(244,63,94,0.75)] hover:from-rose-600 hover:to-rose-700': variant === 'danger',
          'text-slate-600 hover:bg-sky-50/80 dark:text-slate-200 dark:hover:bg-slate-800': variant === 'ghost',
        },
        {
          'min-h-10 rounded-xl px-3 py-2 text-xs': size === 'sm',
          'min-h-11 px-4 py-2.5 text-sm': size === 'md',
          'min-h-12 px-6 py-3 text-base': size === 'lg',
        },
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
}
