import { useMemo } from 'react'
import { TerminalSession } from '../../lib/types'

export type BentoNode =
  | { type: 'pane'; id: string }
  | {
      type: 'split'
      direction: 'horizontal' | 'vertical'
      ratio: number
      children: [BentoNode, BentoNode]
    }

interface BentoLayoutProps {
  sessions: TerminalSession[]
  renderPane: (session: TerminalSession, isMaximized: boolean) => React.ReactNode
  maximizedSessionId: string | null
}

function generateAutoTree(items: string[]): BentoNode {
  if (items.length === 1) return { type: 'pane', id: items[0] }
  if (items.length === 2) {
    return {
      type: 'split',
      direction: 'horizontal',
      ratio: 50,
      children: [
        { type: 'pane', id: items[0] },
        { type: 'pane', id: items[1] },
      ],
    }
  }
  if (items.length === 3) {
    return {
      type: 'split',
      direction: 'horizontal',
      ratio: 50,
      children: [
        { type: 'pane', id: items[0] },
        {
          type: 'split',
          direction: 'vertical',
          ratio: 50,
          children: [
            { type: 'pane', id: items[1] },
            { type: 'pane', id: items[2] },
          ],
        },
      ],
    }
  }

  const half = Math.ceil(items.length / 2)
  const left = items.slice(0, half)
  const right = items.slice(half)

  return {
    type: 'split',
    direction: 'horizontal',
    ratio: (left.length / items.length) * 100,
    children: [
      generateSubTree(left, 'vertical'),
      generateSubTree(right, 'vertical'),
    ],
  }
}

function generateSubTree(items: string[], direction: 'horizontal' | 'vertical'): BentoNode {
  if (items.length === 1) return { type: 'pane', id: items[0] }

  const half = Math.ceil(items.length / 2)

  return {
    type: 'split',
    direction,
    ratio: (half / items.length) * 100,
    children: [
      generateSubTree(items.slice(0, half), direction === 'horizontal' ? 'vertical' : 'horizontal'),
      generateSubTree(items.slice(half), direction === 'horizontal' ? 'vertical' : 'horizontal'),
    ],
  }
}

function renderNode(
  node: BentoNode,
  sessionsById: Map<string, TerminalSession>,
  renderPane: (session: TerminalSession, isMaximized: boolean) => React.ReactNode,
): React.ReactNode {
  if (node.type === 'pane') {
    const session = sessionsById.get(node.id)
    if (!session) return null

    return (
      <div className="relative h-full w-full overflow-hidden bg-ghost-bg">
        {renderPane(session, false)}
      </div>
    )
  }

  const isHorizontal = node.direction === 'horizontal'

  return (
    <div className={`flex h-full w-full overflow-hidden ${isHorizontal ? 'flex-row' : 'flex-col'}`}>
      <div
        className="relative overflow-hidden"
        style={{ [isHorizontal ? 'width' : 'height']: `${node.ratio}%` }}
      >
        {renderNode(node.children[0], sessionsById, renderPane)}
      </div>
      <div
        className={`z-10 shrink-0 bg-ghost-border/40 transition-colors hover:bg-ghost-accent/50 ${
          isHorizontal ? 'h-full w-px cursor-col-resize' : 'h-px w-full cursor-row-resize'
        }`}
      />
      <div className="relative flex-1 overflow-hidden">
        {renderNode(node.children[1], sessionsById, renderPane)}
      </div>
    </div>
  )
}

export function BentoLayout({
  sessions,
  renderPane,
  maximizedSessionId,
}: BentoLayoutProps) {
  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  )

  const tree = useMemo(() => {
    if (sessions.length === 0) return null

    if (maximizedSessionId) {
      const maximizedSession = sessionsById.get(maximizedSessionId)
      if (maximizedSession) {
        return { type: 'pane', id: maximizedSession.id } as BentoNode
      }
    }

    return generateAutoTree(sessions.map((session) => session.id))
  }, [maximizedSessionId, sessions, sessionsById])

  if (!tree) return null

  return (
    <div className="relative h-full w-full overflow-hidden bg-ghost-bg">
      {renderNode(tree, sessionsById, renderPane)}
    </div>
  )
}
