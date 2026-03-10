import { SidebarView } from '../../lib/types'
import { FileExplorer } from '../files/FileExplorer'
import { HistoryPanel } from '../common/HistoryPanel'
import { CommandBlocksPanel } from '../blocks/CommandBlocksPanel'
import { GlobalSwarmPanel } from '../agents/GlobalSwarmPanel'
import { motion, AnimatePresence } from 'framer-motion'

interface VibeSidebarProps {
  activeView: SidebarView | null
}

export function VibeSidebar({ activeView }: VibeSidebarProps) {
  return (
    <AnimatePresence>
      {activeView && activeView !== 'agents' && activeView !== 'settings' && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 320, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="sidebar-panel ml-2 h-full flex flex-col overflow-hidden shrink-0"
        >
          <div className="w-[320px] h-full flex flex-col">
            {activeView === 'files' && <FileExplorer />}
            {activeView === 'history' && <HistoryPanel />}
            {activeView === 'blocks' && <CommandBlocksPanel />}
            {activeView === 'swarm' && <GlobalSwarmPanel />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
