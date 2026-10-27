import { useId, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { generatePassword } from '../lib/generator.js'
import Button from './ui/Button.jsx'

export default function PasswordGenerator({ onUse }) {
  const [options, setOptions] = useState({ length: 20, digits: true, symbols: true })
  const [value, setValue] = useState(() => generatePassword(options))
  const lengthId = useId()

  const update = patch => {
    const next = { ...options, ...patch }
    setOptions(next)
    setValue(generatePassword(next))
  }

  return (
    <div className="flex flex-col gap-3 rounded-ctl border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        <output className="min-w-0 flex-1 break-all font-mono text-sm" aria-label="Generated password">{value}</output>
        <Button size="icon" variant="ghost" aria-label="Generate another" onClick={() => setValue(generatePassword(options))}>
          <RefreshCw className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <label htmlFor={lengthId} className="w-20 text-sm">Length {options.length}</label>
        <input id={lengthId} type="range" min="8" max="64" value={options.length} onChange={e => update({ length: Number(e.target.value) })} className="h-11 flex-1 accent-[var(--accent)] cursor-pointer" />
      </div>
      <div className="flex flex-wrap gap-x-5">
        {[['digits', 'Numbers'], ['symbols', 'Symbols']].map(([key, label]) => (
          <label key={key} className="flex min-h-11 items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={options[key]} onChange={e => update({ [key]: e.target.checked })} className="size-4 accent-[var(--accent)]" />
            {label}
          </label>
        ))}
      </div>
      <Button variant="primary" onClick={() => onUse(value)}>Use this password</Button>
    </div>
  )
}
