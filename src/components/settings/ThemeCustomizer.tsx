import { useSettingsStore } from '../../stores/settingsStore'
import { Check } from 'lucide-react'

export function ThemeCustomizer() {
  const { themeId, setTheme, getAvailableThemes } = useSettingsStore()
  const availableThemes = getAvailableThemes()

  return (
    <div>
      <label className="text-xs text-ghost-text-dim uppercase tracking-wider mb-2 block">Theme</label>
      <div className="flex flex-col gap-1.5">
        {availableThemes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => setTheme(theme.id)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg transition-all border ${
              themeId === theme.id
                ? 'border-ghost-accent bg-ghost-accent/10'
                : 'border-ghost-border hover:border-ghost-accent/50 hover:bg-white/5'
            }`}
          >
            {/* Color preview dots */}
            <div className="flex gap-1">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.colors.accent }} />
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.colors.accent2 }} />
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.colors.accent3 }} />
            </div>
            <span className="text-sm text-ghost-text flex-1 text-left">{theme.name}</span>
            {themeId === theme.id && <Check className="w-3.5 h-3.5 text-ghost-accent" />}
          </button>
        ))}
      </div>
    </div>
  )
}
