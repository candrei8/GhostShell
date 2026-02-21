import { AnimalAvatar } from '../../lib/types'

interface AgentAvatarProps {
  avatar: AnimalAvatar
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeConfig = {
  sm: { container: 'w-6 h-6', emoji: '14px' },
  md: { container: 'w-8 h-8', emoji: '18px' },
  lg: { container: 'w-12 h-12', emoji: '28px' },
}

export function AgentAvatar({ avatar, size = 'md', className = '' }: AgentAvatarProps) {
  const config = sizeConfig[size]

  return (
    <div
      className={`${config.container} rounded-full flex items-center justify-center shrink-0 ${className}`}
      style={{ background: `${avatar.color}25` }}
    >
      <span
        style={{
          fontSize: config.emoji,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        role="img"
        aria-label={avatar.name}
      >
        {avatar.emoji}
      </span>
    </div>
  )
}
