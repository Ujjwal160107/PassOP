import { strength } from '../../lib/generator.js'

const LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong']

export default function StrengthMeter({ password }) {
  if (!password) return null
  const score = strength(password)
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map(i => (
          <span key={i} className={`h-1.5 rounded-full ${i <= score ? 'bg-fg' : 'bg-surface-2'}`} />
        ))}
      </div>
      <span className="w-20 text-right text-xs text-muted">{LABELS[score]}</span>
    </div>
  )
}
