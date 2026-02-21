interface StatusBadgeProps {
  status: 'idle' | 'working' | 'error' | 'offline'
  showLabel?: boolean
}

const statusConfig = {
  idle: { color: 'bg-ghost-text-dim/40', label: 'Idle', textColor: 'text-ghost-text-dim' },
  working: { color: 'bg-ghost-success', label: 'Working', textColor: 'text-ghost-success' },
  error: { color: 'bg-ghost-error', label: 'Error', textColor: 'text-ghost-error' },
  offline: { color: 'bg-gray-600', label: 'Offline', textColor: 'text-gray-500' },
}

export function StatusBadge({ status, showLabel = true }: StatusBadgeProps) {
  const config = statusConfig[status]
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-1.5 h-1.5 rounded-full ${config.color}`}
      />
      {showLabel && (
        <span className={`text-2xs ${config.textColor}`}>{config.label}</span>
      )}
    </div>
  )
}
