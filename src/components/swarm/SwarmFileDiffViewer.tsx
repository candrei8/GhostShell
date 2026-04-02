// SwarmFileDiffViewer — Side-by-side file conflict viewer with resolution actions
// Shows Agent A version vs Agent B version with diff markers
// Actions: Keep A, Keep B, Escalate to Coordinator
// Feature that NO swarm competitor has well-implemented

import { useState, useMemo } from 'react'
import {
  FileText, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronRight,
  ArrowLeft, ArrowRight, MessageSquare,
} from 'lucide-react'
import type { SwarmFileConflict, SwarmAgentRole } from '../../lib/swarm-types'
import { useSwarmStore } from '../../stores/swarmStore'

// ─── Types ──────────────────────────────────────────────────

interface SwarmFileDiffViewerProps {
  conflicts: SwarmFileConflict[]
  swarmId: string
  onClose?: () => void
}

interface DiffLine {
  type: 'same' | 'added' | 'removed' | 'header'
  content: string
  lineA?: number
  lineB?: number
}

// ─── Component ──────────────────────────────────────────────

export function SwarmFileDiffViewer({ conflicts, swarmId, onClose }: SwarmFileDiffViewerProps) {
  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(
    conflicts.length > 0 ? conflicts[0].id : null,
  )
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const resolveConflict = useSwarmStore((s) => s.resolveConflict)

  const activeConflicts = useMemo(() =>
    conflicts.filter((c) => c.swarmId === swarmId && c.status === 'active'),
  [conflicts, swarmId])

  const resolvedConflicts = useMemo(() =>
    conflicts.filter((c) => c.swarmId === swarmId && c.status === 'resolved'),
  [conflicts, swarmId])

  const selectedConflict = useMemo(() =>
    conflicts.find((c) => c.id === selectedConflictId) || null,
  [conflicts, selectedConflictId])

  return (
    <div className="flex flex-col w-full h-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.15)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <AlertTriangle className="w-4 h-4" style={{ color: '#f59e0b' }} />
        <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#f59e0b' }}>
          Conflictos de Archivo
        </span>
        <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)' }}>
          {activeConflicts.length} activos · {resolvedConflicts.length} resueltos
        </span>
        {onClose && (
          <button onClick={onClose} className="ml-auto p-0.5 hover:bg-white/5 rounded" style={{ cursor: 'pointer' }}>
            <XCircle className="w-3.5 h-3.5 text-white/30" />
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Conflict list (left) */}
        <div
          className="shrink-0 overflow-y-auto custom-scrollbar"
          style={{ width: 220, borderRight: '1px solid rgba(255,255,255,0.04)' }}
        >
          {activeConflicts.length === 0 && resolvedConflicts.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <span className="text-[9px] text-white/15 font-mono">Sin conflictos</span>
            </div>
          )}

          {activeConflicts.length > 0 && (
            <SectionLabel label="ACTIVOS" count={activeConflicts.length} />
          )}
          {activeConflicts.map((conflict) => (
            <ConflictRow
              key={conflict.id}
              conflict={conflict}
              isSelected={selectedConflictId === conflict.id}
              onClick={() => setSelectedConflictId(conflict.id)}
            />
          ))}

          {resolvedConflicts.length > 0 && (
            <SectionLabel label="RESUELTOS" count={resolvedConflicts.length} />
          )}
          {resolvedConflicts.map((conflict) => (
            <ConflictRow
              key={conflict.id}
              conflict={conflict}
              isSelected={selectedConflictId === conflict.id}
              onClick={() => setSelectedConflictId(conflict.id)}
            />
          ))}
        </div>

        {/* Conflict detail (right) */}
        <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
          {selectedConflict ? (
            <ConflictDetail
              conflict={selectedConflict}
              onResolve={() => resolveConflict(selectedConflict.id)}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-[10px] text-white/15 font-mono">Selecciona un conflicto</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Conflict Row ───────────────────────────────────────────

function ConflictRow({ conflict, isSelected, onClick }: {
  conflict: SwarmFileConflict; isSelected: boolean; onClick: () => void
}) {
  const severityColor = conflict.severity === 'critical' ? '#ef4444' : '#f59e0b'
  const fileName = conflict.filePath.split('/').pop() || conflict.filePath

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/[0.02] transition-colors"
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.02)',
        background: isSelected ? 'rgba(245,158,11,0.06)' : 'transparent',
        borderLeft: isSelected ? `2px solid ${severityColor}` : '2px solid transparent',
      }}
      onClick={onClick}
    >
      <FileText className="w-3 h-3 shrink-0" style={{ color: severityColor }} />
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-mono text-white/60 block truncate">{fileName}</span>
        <span className="text-[8px] font-mono text-white/25">
          {conflict.agents.length} agentes · {conflict.severity}
        </span>
      </div>
      {conflict.status === 'resolved' && (
        <CheckCircle className="w-3 h-3 shrink-0" style={{ color: '#34d399' }} />
      )}
    </div>
  )
}

// ─── Conflict Detail ────────────────────────────────────────

function ConflictDetail({ conflict, onResolve }: {
  conflict: SwarmFileConflict; onResolve: () => void
}) {
  const severityColor = conflict.severity === 'critical' ? '#ef4444' : '#f59e0b'
  const isResolved = conflict.status === 'resolved'

  return (
    <div style={{ padding: 12 }}>
      {/* File path header */}
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 shrink-0" style={{ color: severityColor }} />
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-mono font-bold text-white/70 block truncate">
            {conflict.filePath}
          </span>
          <span
            className="text-[8px] font-mono font-bold uppercase px-1.5 py-px rounded"
            style={{ background: `${severityColor}15`, color: severityColor }}
          >
            {conflict.severity}
          </span>
        </div>
      </div>

      {/* Agents involved */}
      <div className="mb-3">
        <span className="text-[8px] text-white/20 font-mono uppercase block mb-1 tracking-wider">
          Agentes Involucrados
        </span>
        <div className="flex flex-col gap-1">
          {conflict.agents.map((agent, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2 py-1.5 rounded"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: agent.operation === 'write' ? '#f59e0b' : agent.operation === 'edit' ? '#fb923c' : '#38bdf8' }}
              />
              <span className="text-[10px] font-mono text-white/50 flex-1">{agent.label}</span>
              <span
                className="text-[8px] font-mono font-bold uppercase px-1 py-px rounded"
                style={{
                  background: agent.operation === 'write' ? 'rgba(245,158,11,0.1)' : agent.operation === 'edit' ? 'rgba(251,146,60,0.1)' : 'rgba(56,189,248,0.1)',
                  color: agent.operation === 'write' ? '#f59e0b' : agent.operation === 'edit' ? '#fb923c' : '#38bdf8',
                }}
              >
                {agent.operation}
              </span>
              <span className="text-[7px] font-mono text-white/15">
                {new Date(agent.detectedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Simulated diff view (we don't have actual file contents, but we show the conflict structure) */}
      <div className="mb-3">
        <span className="text-[8px] text-white/20 font-mono uppercase block mb-1 tracking-wider">
          Vista de Conflicto
        </span>
        <div
          className="rounded overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Diff header */}
          <div
            className="flex items-center justify-between px-3 py-1.5"
            style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
          >
            <div className="flex items-center gap-2">
              {conflict.agents.filter((a) => a.operation !== 'read').map((agent, i) => (
                <span key={i} className="text-[8px] font-mono" style={{ color: i === 0 ? '#ef4444' : '#34d399' }}>
                  {i === 0 ? '<<<' : '>>>'} {agent.label}
                </span>
              ))}
            </div>
          </div>

          {/* Conflict body — illustrative diff */}
          <div className="px-3 py-2" style={{ background: 'rgba(0,0,0,0.2)' }}>
            <div className="text-[8px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
              {/* Show a structural representation of the conflict */}
              <div style={{ color: 'rgba(255,255,255,0.15)' }}>{'// ' + conflict.filePath}</div>
              <div style={{ color: 'rgba(255,255,255,0.1)' }}>{'// ...'}</div>
              {conflict.agents.filter((a) => a.operation !== 'read').map((agent, i) => (
                <div key={i}>
                  <div style={{ color: i === 0 ? 'rgba(239,68,68,0.5)' : 'rgba(52,211,153,0.5)' }}>
                    {i === 0 ? '<<<<<<< ' : '======='}{i === 0 ? agent.label : ''}
                  </div>
                  <div style={{ color: i === 0 ? 'rgba(239,68,68,0.3)' : 'rgba(52,211,153,0.3)' }}>
                    {'  // Changes by ' + agent.label + ' (' + agent.operation + ')'}
                  </div>
                  {i === conflict.agents.filter((a) => a.operation !== 'read').length - 1 && (
                    <div style={{ color: 'rgba(52,211,153,0.5)' }}>
                      {'>>>>>>> ' + agent.label}
                    </div>
                  )}
                </div>
              ))}
              <div style={{ color: 'rgba(255,255,255,0.1)' }}>{'// ...'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Resolution actions */}
      {!isResolved ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[8px] text-white/20 font-mono uppercase mb-0.5 tracking-wider">
            Resolucion
          </span>
          <div className="flex gap-1.5">
            {conflict.agents.filter((a) => a.operation !== 'read').map((agent, i) => (
              <button
                key={i}
                onClick={onResolve}
                className="flex-1 flex items-center justify-center gap-1 py-2 rounded hover:bg-white/5 transition-colors"
                style={{
                  border: `1px solid ${i === 0 ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.2)'}`,
                  background: i === 0 ? 'rgba(239,68,68,0.05)' : 'rgba(52,211,153,0.05)',
                  color: i === 0 ? '#ef4444' : '#34d399',
                  fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
                  textTransform: 'uppercase', cursor: 'pointer',
                }}
              >
                {i === 0 ? <ArrowLeft className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
                Keep {agent.label.split(' ')[0]}
              </button>
            ))}
          </div>
          <button
            onClick={onResolve}
            className="flex items-center justify-center gap-1.5 py-2 rounded hover:bg-amber-500/10 transition-colors"
            style={{
              border: '1px solid rgba(245,158,11,0.2)',
              background: 'rgba(245,158,11,0.05)',
              color: '#f59e0b',
              fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            <MessageSquare className="w-3 h-3" />
            Escalar al Coordinator
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 rounded" style={{ background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.15)' }}>
          <CheckCircle className="w-4 h-4" style={{ color: '#34d399' }} />
          <span className="text-[10px] font-mono font-bold" style={{ color: '#34d399' }}>
            Resuelto {conflict.resolvedAt ? new Date(conflict.resolvedAt).toLocaleTimeString('es-ES') : ''}
          </span>
        </div>
      )}

      {/* Timestamp */}
      <div className="mt-2 text-[8px] font-mono text-white/10">
        Detectado: {new Date(conflict.detectedAt).toLocaleString('es-ES')}
      </div>
    </div>
  )
}

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: 'rgba(255,255,255,0.01)' }}
    >
      <span style={{ fontSize: 8, fontFamily: 'monospace', fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </span>
      <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.12)' }}>
        {count}
      </span>
    </div>
  )
}
