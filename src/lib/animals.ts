import { AnimalAvatar } from './types'

export const animals: AnimalAvatar[] = [
  { id: 'ghost', name: 'Ghost', emoji: '\u{1F47B}', color: '#a855f7' },
  { id: 'cat', name: 'Cat', emoji: '\u{1F431}', color: '#f472b6' },
  { id: 'dog', name: 'Dog', emoji: '\u{1F415}', color: '#fb923c' },
  { id: 'fox', name: 'Fox', emoji: '\u{1F98A}', color: '#f97316' },
  { id: 'owl', name: 'Owl', emoji: '\u{1F989}', color: '#a78bfa' },
  { id: 'bear', name: 'Bear', emoji: '\u{1F43B}', color: '#92400e' },
  { id: 'wolf', name: 'Wolf', emoji: '\u{1F43A}', color: '#6b7280' },
  { id: 'dragon', name: 'Dragon', emoji: '\u{1F409}', color: '#ef4444' },
  { id: 'phoenix', name: 'Phoenix', emoji: '\u{1F525}', color: '#f59e0b' },
  { id: 'octopus', name: 'Octopus', emoji: '\u{1F419}', color: '#ec4899' },
  { id: 'penguin', name: 'Penguin', emoji: '\u{1F427}', color: '#06b6d4' },
  { id: 'rabbit', name: 'Rabbit', emoji: '\u{1F430}', color: '#d946ef' },
  { id: 'tiger', name: 'Tiger', emoji: '\u{1F42F}', color: '#ea580c' },
  { id: 'snake', name: 'Snake', emoji: '\u{1F40D}', color: '#22c55e' },
  { id: 'eagle', name: 'Eagle', emoji: '\u{1F985}', color: '#78716c' },
  { id: 'unicorn', name: 'Unicorn', emoji: '\u{1F984}', color: '#e879f9' },
]

export function getAnimal(id: string): AnimalAvatar {
  return animals.find(a => a.id === id) || animals[0]
}

export function getRandomAnimal(): AnimalAvatar {
  return animals[Math.floor(Math.random() * animals.length)]
}
