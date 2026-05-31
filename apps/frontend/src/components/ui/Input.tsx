import { cn } from '@/utils/cn'
import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, placeholder, ...props }, ref) => {
    const autoPlaceholder = placeholder ?? (label ? `Nhập ${label.toLowerCase()}` : undefined)
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          placeholder={autoPlaceholder}
          className={cn(
            'block min-h-11 w-full rounded-xl border border-amber-100/80 bg-white/95 px-4 py-2.5 text-slate-800 shadow-[0_1px_0_rgba(255,255,255,0.8)] placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-300/60 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400 dark:focus:border-amber-400 dark:focus:ring-amber-500/30 sm:text-sm',
            error && 'border-rose-300 focus:border-rose-500 focus:ring-rose-300/60',
            className,
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{error}</p>}
      </div>
    )
  },
)

Input.displayName = 'Input'
export default Input
