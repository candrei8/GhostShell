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
    <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-slate-800/50 transition-colors">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-10 h-[22px] rounded-full transition-colors flex items-center px-0.5 shrink-0 ${trackColor}`}
      >
        <div className={`w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0'}`} />
      </button>
      <div className="flex flex-col min-w-0">
        <span className="text-sm text-ghost-text">{label}</span>
        {description && <span className="text-xs text-ghost-text-dim/60">{description}</span>}
      </div>
    </label>
  )
}
