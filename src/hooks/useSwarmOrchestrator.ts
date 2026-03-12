import { useCallback } from 'react'
import { useAgent } from './useAgent'
import { orchestrateSwarm } from '../lib/swarm-orchestrator'
import type { Swarm } from '../lib/swarm-types'

export function useSwarmOrchestrator() {
  const { createAgent } = useAgent()

  const launchSwarmAgents = useCallback(
    async (swarm: Swarm, paneId: string) => {
      await orchestrateSwarm(swarm, paneId, createAgent)
    },
    [createAgent],
  )

  return { launchSwarmAgents }
}
