interface RangeSliderProps {
  min: number
  max: number
  value: number
  onChange: (value: number) => void
  label: string
  unit?: string
}

export function RangeSlider({ min, max, value, onChange, label, unit = 'px' }: RangeSliderProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ghost-text">{label}</span>
        <span className="text-xs font-mono font-medium text-ghost-accent bg-indigo-950/50 px-2 py-0.5 rounded-full">
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ghost-range w-full"
      />
    </div>
  )
}
