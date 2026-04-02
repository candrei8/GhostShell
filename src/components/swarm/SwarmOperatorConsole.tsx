// SwarmOperatorConsole — Full operator command interface
// Terminal-style command input with history, autocomplete, and audit trail
// Commands: broadcast, msg, reassign, pause, resume, inject, approve, reject, checkpoint, rollback, status, cost

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Terminal, ChevronRight, Send } from 'lucide-react'
import type { Swarm, SwarmRosterAgent } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'
import { operatorBroadcast, operatorMessageAgent, operatorInjectContext } from '../../lib/swarm-operator'
import { useSwarmStore } from '../../stores/swarmStore'

// ─── Types ──────────────────────────────────────────────────

interface SwarmOperatorConsoleProps {
  swarm: Swarm
  agents: Array<{ agent: { rosterId: string; terminalId?: string; status: string }; rosterAgent: SwarmRosterAgent }>
}

interface AuditEntry {
  id: string
  timestamp: number
  command: string
  result: string
  success: boolean
}

const COMMANDS: Record<string, { desc: string; usage: string }> = {
  broadcast:  { desc: 'Enviar mensaje a todos', usage: 'broadcast <mensaje>' },
  msg:        { desc: 'DM a un agente', usage: 'msg <agente> <mensaje>' },
  status:     { desc: 'Resumen del swarm', usage: 'status' },
  approve:    { desc: 'Aprobar solicitud', usage: 'approve <id>' },
  reject:     { desc: 'Rechazar solicitud', usage: 'reject <id>' },
  inject:     { desc: 'Inyectar contexto', usage: 'inject <agente> <texto>' },
  cost:       { desc: 'Desglose de costos', usage: 'cost' },
  help:       { desc: 'Mostrar comandos', usage: 'help' },
}

// ─── Component ──────────────────────────────────────────────

export function SwarmOperatorConsole({ swarm, agents }: SwarmOperatorConsoleProps) {
  const [input, setInput] = useState('')
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const resolveApproval = useSwarmStore((s) => s.resolveApproval)
  const approvalQueue = useSwarmStore((s) => s.approvalQueue)
  const conflicts = useSwarmStore((s) => s.conflicts)

  const commandHistory = useMemo(() => audit.map((a) => a.command).reverse(), [audit])

  // Agent labels for autocomplete
  const agentLabels = useMemo(() =>
    agents.map(({ rosterAgent }, idx) => {
      const roleDef = getRoleDef(rosterAgent.role)
      return rosterAgent.customName || `${roleDef.label} ${idx + 1}`
    }), [agents])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [audit.length])

  const addAudit = useCallback((command: string, result: string, success: boolean) => {
    setAudit((prev) => [...prev.slice(-99), {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      command,
      result,
      success,
    }])
  }, [])

  const executeCommand = useCallback(() => {
    const raw = input.trim()
    if (!raw) return
    setInput('')
    setHistoryIdx(-1)

    const parts = raw.split(/\s+/)
    const cmd = parts[0].toLowerCase()
    const args = parts.slice(1)
    const swarmRoot = (swarm as unknown as { swarmRoot?: string }).swarmRoot

    switch (cmd) {
      case 'help': {
        const lines = Object.entries(COMMANDS).map(([k, v]) => `  ${k.padEnd(12)} ${v.desc}`)
        addAudit(raw, lines.join('\n'), true)
        break
      }
      case 'broadcast': {
        const msg = args.join(' ')
        if (!msg) { addAudit(raw, 'Uso: broadcast <mensaje>', false); break }
        if (!swarmRoot) { addAudit(raw, 'Error: swarmRoot no disponible', false); break }
        operatorBroadcast(swarmRoot, msg, undefined, 'message')
        addAudit(raw, `Broadcast enviado: "${msg}"`, true)
        break
      }
      case 'msg': {
        if (args.length < 2) { addAudit(raw, 'Uso: msg <agente> <mensaje>', false); break }
        const target = args[0]
        const msg = args.slice(1).join(' ')
        if (!swarmRoot) { addAudit(raw, 'Error: swarmRoot no disponible', false); break }
        if (!agentLabels.some((l) => l.toLowerCase().startsWith(target.toLowerCase()))) {
          addAudit(raw, `Agente "${target}" no encontrado. Disponibles: ${agentLabels.join(', ')}`, false)
          break
        }
        const fullLabel = agentLabels.find((l) => l.toLowerCase().startsWith(target.toLowerCase())) || target
        operatorMessageAgent(swarmRoot, fullLabel, msg, 'message')
        addAudit(raw, `DM a ${fullLabel}: "${msg}"`, true)
        break
      }
      case 'status': {
        const running = swarm.agents.filter((a) => ['building', 'planning', 'review'].includes(a.status)).length
        const idle = swarm.agents.filter((a) => ['waiting', 'idle'].includes(a.status)).length
        const done = swarm.agents.filter((a) => a.status === 'done').length
        const tasksDone = swarm.tasks.filter((t) => t.status === 'done').length
        const activeConflicts = conflicts.filter((c) => c.status === 'active').length
        const pendingApprovals = approvalQueue.filter((a) => a.status === 'pending').length
        const elapsed = swarm.startedAt ? Math.round((Date.now() - swarm.startedAt) / 60000) : 0
        const lines = [
          `Swarm: ${swarm.config.name || swarm.id}`,
          `Estado: ${swarm.status} · ${elapsed}m elapsed`,
          `Agentes: ${running} activos, ${idle} idle, ${done} done (${swarm.agents.length} total)`,
          `Tareas: ${tasksDone}/${swarm.tasks.length} completadas`,
          `Conflictos: ${activeConflicts} activos`,
          `Aprobaciones: ${pendingApprovals} pendientes`,
          `Mensajes: ${swarm.messages.length}`,
        ]
        addAudit(raw, lines.join('\n'), true)
        break
      }
      case 'approve': {
        const id = args[0]
        if (!id) { addAudit(raw, 'Uso: approve <id>', false); break }
        const found = approvalQueue.find((a) => a.id === id || a.id.startsWith(id))
        if (!found) { addAudit(raw, `Aprobacion "${id}" no encontrada`, false); break }
        resolveApproval(found.id, true)
        addAudit(raw, `Aprobado: ${found.action}`, true)
        break
      }
      case 'reject': {
        const id = args[0]
        if (!id) { addAudit(raw, 'Uso: reject <id>', false); break }
        const found = approvalQueue.find((a) => a.id === id || a.id.startsWith(id))
        if (!found) { addAudit(raw, `Aprobacion "${id}" no encontrada`, false); break }
        resolveApproval(found.id, false)
        addAudit(raw, `Rechazado: ${found.action}`, true)
        break
      }
      case 'inject': {
        if (args.length < 2) { addAudit(raw, 'Uso: inject <agente> <contexto>', false); break }
        if (!swarmRoot) { addAudit(raw, 'Error: swarmRoot no disponible', false); break }
        const target = args[0]
        const context = args.slice(1).join(' ')
        const fullLabel = agentLabels.find((l) => l.toLowerCase().startsWith(target.toLowerCase())) || target
        operatorInjectContext(swarmRoot, fullLabel, context)
        addAudit(raw, `Contexto inyectado a ${fullLabel}`, true)
        break
      }
      case 'cost': {
        let totalTokens = 0
        for (const agent of swarm.agents) {
          const metrics = (agent as unknown as { metrics?: { totalTokens?: number } }).metrics
          totalTokens += metrics?.totalTokens || 0
        }
        const cost = (totalTokens / 1_000_000) * 5
        const elapsed = swarm.startedAt ? (Date.now() - swarm.startedAt) / 60000 : 0
        const burnRate = elapsed > 0.5 ? cost / elapsed : 0
        addAudit(raw, [
          `Tokens: ${Math.round(totalTokens / 1000)}k`,
          `Costo estimado: $${cost.toFixed(2)}`,
          `Burn rate: $${burnRate.toFixed(3)}/min`,
          `Agentes: ${swarm.agents.length}`,
        ].join('\n'), true)
        break
      }
      default:
        addAudit(raw, `Comando desconocido: "${cmd}". Escribe "help" para ver comandos.`, false)
    }
  }, [input, swarm, agents, agentLabels, addAudit, resolveApproval, approvalQueue, conflicts])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length > 0) {
        const newIdx = Math.min(historyIdx + 1, commandHistory.length - 1)
        setHistoryIdx(newIdx)
        setInput(commandHistory[newIdx])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIdx > 0) {
        const newIdx = historyIdx - 1
        setHistoryIdx(newIdx)
        setInput(commandHistory[newIdx])
      } else {
        setHistoryIdx(-1)
        setInput('')
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      // Autocomplete agent names
      const parts = input.split(/\s+/)
      if (parts.length >= 2) {
        const partial = parts[parts.length - 1].toLowerCase()
        const match = agentLabels.find((l) => l.toLowerCase().startsWith(partial))
        if (match) {
          parts[parts.length - 1] = match
          setInput(parts.join(' ') + ' ')
        }
      } else if (parts.length === 1) {
        const partial = parts[0].toLowerCase()
        const match = Object.keys(COMMANDS).find((c) => c.startsWith(partial))
        if (match) setInput(match + ' ')
      }
    }
  }, [executeCommand, commandHistory, historyIdx, input, agentLabels])

  return (
    <div className="flex flex-col h-full" style={{ background: 'rgba(0,0,0,0.2)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Terminal className="w-3 h-3" style={{ color: '#38bdf8' }} />
        <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Operator Console
        </span>
        <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.15)', marginLeft: 'auto' }}>
          {audit.length} comandos
        </span>
      </div>

      {/* Audit trail (scrollable) */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar min-h-0 px-2 py-1">
        {audit.length === 0 && (
          <div className="text-[9px] text-white/10 font-mono text-center py-4">
            Escribe "help" para ver comandos disponibles
          </div>
        )}
        {audit.map((entry) => (
          <div key={entry.id} className="mb-1.5">
            {/* Command line */}
            <div className="flex items-center gap-1">
              <ChevronRight className="w-2 h-2 shrink-0" style={{ color: '#38bdf8' }} />
              <span className="text-[9px] font-mono text-white/60">{entry.command}</span>
              <span className="text-[7px] font-mono text-white/10 ml-auto shrink-0">
                {new Date(entry.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            {/* Result */}
            <pre className="text-[8px] font-mono pl-3 mt-0.5 whitespace-pre-wrap"
              style={{ color: entry.success ? 'rgba(255,255,255,0.35)' : '#ef4444' }}>
              {entry.result}
            </pre>
          </div>
        ))}
      </div>

      {/* Command input */}
      <div className="flex items-center gap-1 px-2 py-1.5 shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)' }}>
        <span style={{ color: '#38bdf8', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{'>'}</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="help, broadcast, msg, status, cost..."
          className="flex-1 bg-transparent outline-none"
          style={{ fontSize: 10, fontFamily: 'monospace', color: 'white' }}
          autoFocus
        />
        <button
          onClick={executeCommand}
          disabled={!input.trim()}
          className="p-1 rounded hover:bg-sky-500/20 transition-colors disabled:opacity-20"
          style={{ color: '#38bdf8', cursor: 'pointer' }}
        >
          <Send className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
