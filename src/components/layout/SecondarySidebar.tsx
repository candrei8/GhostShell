import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SidebarView } from '../../lib/types'
import { MissionControlFeed } from '../agents/MissionControlFeed'
import { FileExplorer } from '../files/FileExplorer'
import { HistoryPanel } from '../common/HistoryPanel'

interface SecondarySidebarProps {
  activeView: SidebarView
  collapsed: boolean
}

const viewOrder: SidebarView[] = ['agents', 'files', 'history', 'settings']

function getDirection(from: SidebarView, to: SidebarView) {
  return viewOrder.indexOf(to) > viewOrder.indexOf(from) ? 1 : -1
}

const cubicEase = [0.4, 0, 0.2, 1] as const

export function SecondarySidebar({ activeView, collapsed }: SecondarySidebarProps) {
  const effectiveCollapsed = collapsed || activeView === 'settings'
  const [width, setWidth] = useState(340)
  const [isResizing, setIsResizing] = useState(false)
  const prevViewRef = useRef(activeView)
  const directionRef = useRef(1)

  // Track direction of view change
  useEffect(() => {
    if (activeView !== prevViewRef.current) {
      directionRef.current = getDirection(prevViewRef.current, activeView)
      prevViewRef.current = activeView
    }
  }, [activeView])

  // Drag-to-resize
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsResizing(true)
      const startX = e.clientX
      const startWidth = width

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX
        setWidth(Math.min(500, Math.max(280, startWidth + delta)))
      }
      const onUp = () => {
        setIsResizing(false)
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [width]
  )

  const direction = directionRef.current

  return (
    <motion.div
      className="h-full bg-ghost-sidebar border-r border-ghost-border flex flex-col overflow-hidden relative"
      animate={{
        width: effectiveCollapsed ? 0 : width,
        minWidth: effectiveCollapsed ? 0 : width,
        opacity: effectiveCollapsed ? 0 : 1,
      }}
      transition={{ duration: 0.25, ease: cubicEase }}
    >
      {!effectiveCollapsed && (
        <>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeView}
              className="flex-1 overflow-hidden"
              initial={{ opacity: 0, y: direction * 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: direction * -12 }}
              transition={{ duration: 0.18, ease: cubicEase }}
            >
              {activeView === 'files' && <FileExplorer />}
              {activeView === 'agents' && <MissionControlFeed />}
              {activeView === 'history' && <HistoryPanel />}
            </motion.div>
          </AnimatePresence>

          {/* Resize handle */}
          <div
            className={`resize-handle ${isResizing ? 'active' : ''}`}
            onMouseDown={handleMouseDown}
          />
        </>
      )}
    </motion.div>
  )
}
