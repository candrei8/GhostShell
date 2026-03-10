import { Check } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'

export function ThemeCustomizer() {
  const { themeId, setTheme, getAvailableThemes } = useSettingsStore()
  const availableThemes = getAvailableThemes()

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs text-ghost-text-dim uppercase tracking-wider mb-2 block">Theme</label>
        <p className="text-xs text-ghost-text-dim/80">
          Tema visual de la app. Esta vista se mantiene ligera para que el modal abra sin bloquear el renderer.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        {availableThemes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => setTheme(theme.id)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-left transition-all ${
              themeId === theme.id
                ? 'border-ghost-accent bg-ghost-accent/12'
                : 'border-white/10 bg-black/20 hover:border-ghost-accent/40 hover:bg-white/5'
            }`}
          >
            <div className="flex gap-1">
              <div className="h-4 w-4 rounded-full" style={{ backgroundColor: theme.colors.accent }} />
              <div className="h-4 w-4 rounded-full" style={{ backgroundColor: theme.colors.accent2 }} />
              <div className="h-4 w-4 rounded-full" style={{ backgroundColor: theme.colors.accent3 }} />
            </div>
            <span className="flex-1 text-sm text-ghost-text">{theme.name}</span>
            {themeId === theme.id && <Check className="h-3.5 w-3.5 text-ghost-accent" />}
          </button>
        ))}
      </div>
    </div>
  )
}
