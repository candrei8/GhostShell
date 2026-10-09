/**
 * Human names for panes. A wall of six "Terminal" / "Claude 2" panes is
 * impossible to tell apart at a glance; "Emma" and "James" are not.
 */
export const PANE_NAMES = [
  'Emma', 'James', 'Olivia', 'Michael', 'Grace', 'Daniel',
  'Sofia', 'Lucas', 'Chloe', 'Noah', 'Ava', 'Leo',
  'Mia', 'Ethan', 'Zoe', 'Hugo', 'Nora', 'Adam',
  'Lily', 'Oscar', 'Ruby', 'Felix', 'Iris', 'Theo',
  'Luna', 'Marco', 'Elena', 'Diego', 'Alba', 'Max',
] as const

// Placeholder titles the app hands out when it has nothing better to say.
const GENERIC_TITLE = /^(?:terminal|new session|session|shell|powershell|pwsh|cmd|bash|zsh|claude(?: code)?|codex|gemini)(?:\s*\(?\d+\)?)?$/i

/** True for empty or placeholder titles that should be replaced by a name. */
export function isGenericTitle(title: string | undefined | null): boolean {
  const trimmed = title?.trim()
  return !trimmed || GENERIC_TITLE.test(trimmed)
}

/**
 * First name from PANE_NAMES not already taken (case-insensitive). After all
 * thirty are in use, continues with "Emma 2", "James 2", …
 */
export function nextPaneName(taken: Iterable<string>): string {
  const used = new Set<string>()
  for (const title of taken) used.add(title.trim().toLowerCase())

  for (let round = 1; ; round++) {
    for (const name of PANE_NAMES) {
      const candidate = round === 1 ? name : `${name} ${round}`
      if (!used.has(candidate.toLowerCase())) return candidate
    }
  }
}
