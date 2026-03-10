import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderOpen, History, Blocks, Settings, LayoutGrid } from 'lucide-react'
import { FileExplorer } from '../files/FileExplorer'
import { HistoryPanel } from '../common/HistoryPanel'
import { CommandBlocksPanel } from '../blocks/CommandBlocksPanel'

// Settings modal is handled separately in AppLayout, but we can trigger it here if needed.

interface FloatingSidePanelProps {
  activeView: 'files' | 'history' | 'blocks' | null
}

export function FloatingSidePanel({ activeView }: FloatingSidePanelProps) {
  if (!activeView) return null;

  return (
    <div className="flex-1 flex flex-col h-full">
      {activeView === 'files' && <FileExplorer />}
      {activeView === 'history' && <HistoryPanel />}
      {activeView === 'blocks' && <CommandBlocksPanel />}
    </div>
  )
}
