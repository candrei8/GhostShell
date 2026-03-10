import { AgentAvatarConfig } from './types'

export const defaultAvatars: AgentAvatarConfig[] = [
  { id: 'bot-1', name: 'Bot', icon: 'Bot', color: '#a1a1aa' },
  { id: 'term-1', name: 'Terminal', icon: 'Terminal', color: '#e4e4e7' },
  { id: 'zap-1', name: 'Zap', icon: 'Zap', color: '#f59e0b' },
  { id: 'code-1', name: 'Code', icon: 'Code', color: '#10b981' },
  { id: 'shield-1', name: 'Shield', icon: 'Shield', color: '#ef4444' },
  { id: 'gauge-1', name: 'Gauge', icon: 'Gauge', color: '#3b82f6' },
  { id: 'db-1', name: 'Database', icon: 'Database', color: '#8b5cf6' },
  { id: 'cloud-1', name: 'Cloud', icon: 'Cloud', color: '#06b6d4' },
]

export function getAvatar(id: string): AgentAvatarConfig {
  return defaultAvatars.find(a => a.id === id) || defaultAvatars[0]
}

export function getRandomAvatar(): AgentAvatarConfig {
  return defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)]
}
