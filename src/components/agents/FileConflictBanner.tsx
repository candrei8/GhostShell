import { useState, useMemo } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, FileWarning } from 'lucide-react'
import { useActivityStore } from '../../stores/activityStore'
import { useAgentStore } from '../../stores/agentStore'

export function FileConflictBanner() {
  const [expanded, setExpanded] = useState(false)
  const activities = useActivityStore((s) => s.activities)
  const agents = useAgentStore((s) => s.agents)

  // Compute conflicts from raw activities (stable selector, derived in component)
  const conflicts = useMemo(() => {
    const writeMap = new Map<string, Set<string>>()
    for (const activity of Object.values(activities)) {
      for (const touch of activity.filesTouched) {
        if (touch.operation === 'write' || touch.operation === 'edit') {
          if (!writeMap.has(touch.path)) writeMap.set(touch.path, new Set())
          writeMap.get(touch.path)!.add(touch.agentId)
        }
      }
    }
    const result: { path: string; agentIds: string[] }[] = []
    for (const [path, agentIds] of writeMap) {
      if (agentIds.size > 1) {
        result.push({ path, agentIds: Array.from(agentIds) })
      }
    }
    return result
  }, [activities])

  if (conflicts.length === 0) return null

  const getAgentName = (id: string) => agents.find((a) => a.id === id)?.name || id

  return (
    <div className="mx-3 mb-2 rounded-lg border border-orange-500/30 bg-orange-500/[0.04] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-orange-500/10 transition-colors"
      >
        <FileWarning className="w-3.5 h-3.5 text-orange-400 shrink-0" />
        <span className="text-[10px] text-orange-300 font-semibold">
          {conflicts.length} file conflict{conflicts.length > 1 ? 's' : ''}
        </span>
        <span className="text-[10px] text-orange-400/40 ml-auto mr-1">
          Multiple agents editing same files
        </span>
        {expanded
          ? <ChevronUp className="w-3 h-3 text-orange-400 shrink-0" />
          : <ChevronDown className="w-3 h-3 text-orange-400 shrink-0" />
        }
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1.5">
          {conflicts.map(({ path, agentIds }) => {
            const fileName = path.replace(/\\/g, '/').split('/').pop() || path
            const dirPath = path.replace(/\\/g, '/').split('/').slice(0, -1).pop() || ''
            return (
              <div key={path} className="flex items-start gap-2 text-[10px]">
                <AlertTriangle className="w-3 h-3 text-orange-400/50 mt-0.5 shrink-0" />
                <div>
                  <span className="text-orange-300 font-mono font-semibold">{fileName}</span>
                  {dirPath && <span className="text-orange-400/30 ml-1">{dirPath}/</span>}
                  <div className="text-orange-300/50 mt-0.5">
                    {agentIds.map((id) => getAgentName(id)).join(' \u2022 ')}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
