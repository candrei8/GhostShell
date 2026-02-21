interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  color?: 'accent' | 'orange'
}

export function Toggle({ checked, onChange, label, description, color = 'accent' }: ToggleProps) {
  const trackColor = checked
    ? color === 'orange' ? 'bg-orange-500' : 'bg-ghost-accent'
    : 'bg-ghost-border'

  return (
    <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-white/5 transition-colors">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${trackColor}`}
      >
        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
      <div className="flex flex-col min-w-0">
        <span className="text-sm text-ghost-text">{label}</span>
        {description && <span className="text-xs text-ghost-text-dim/60">{description}</span>}
      </div>
    </label>
  )
}
