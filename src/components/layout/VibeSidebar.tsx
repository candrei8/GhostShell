import { SidebarView } from '../../lib/types'
import { FileExplorer } from '../files/FileExplorer'
import { HistoryPanel } from '../common/HistoryPanel'
import { CommandBlocksPanel } from '../blocks/CommandBlocksPanel'
import { GlobalSwarmPanel } from '../agents/GlobalSwarmPanel'
import { SwarmDashboard } from '../swarm/SwarmDashboard'
import { useSwarmStore } from '../../stores/swarmStore'
import { motion, AnimatePresence } from 'framer-motion'

interface VibeSidebarProps {
  activeView: SidebarView | null
}

function SwarmView() {
  const hasActiveSwarm = useSwarmStore((s) => s.activeSwarmId !== null)
  if (hasActiveSwarm) {
    return <SwarmDashboard />
  }
  return <GlobalSwarmPanel />
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
            {activeView === 'swarm' && <SwarmView />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
