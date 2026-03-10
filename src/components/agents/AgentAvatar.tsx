import { AgentAvatarConfig } from '../../lib/types'
import * as LucideIcons from 'lucide-react'

interface AgentAvatarProps {
  avatar: AgentAvatarConfig
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeConfig = {
  sm: { container: 'w-6 h-6', icon: 12 },
  md: { container: 'w-8 h-8', icon: 16 },
  lg: { container: 'w-10 h-10', icon: 20 },
}

export function AgentAvatar({ avatar, size = 'md', className = '' }: AgentAvatarProps) {
  const config = sizeConfig[size]

  // Dynamically get the icon component or fallback to Bot
  const IconComponent = (LucideIcons as any)[avatar.icon] || LucideIcons.Bot

  return (
    <div
      className={`${config.container} rounded-sm flex items-center justify-center shrink-0 border shadow-minimal ${className}`}
      style={{
        backgroundColor: 'var(--ghost-surface)',
        borderColor: avatar.color || 'var(--ghost-border)',
        color: avatar.color || 'var(--ghost-text)'
      }}
      title={avatar.name}
    >
      <IconComponent size={config.icon} strokeWidth={2} />
    </div>
  )
}
