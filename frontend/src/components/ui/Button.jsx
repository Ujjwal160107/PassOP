import { LoaderCircle } from 'lucide-react'

const VARIANTS = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 shadow-sm',
  secondary: 'bg-surface text-fg border border-border hover:bg-surface-2',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-danger text-danger-fg hover:brightness-110',
}

const SIZES = {
  md: 'h-11 px-4 gap-2 text-sm font-medium',
  icon: 'size-11 shrink-0',
}

export default function Button({ variant = 'secondary', size = 'md', loading = false, className = '', children, disabled, type = 'button', ...props }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-ctl transition-[background-color,color,filter] duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}
