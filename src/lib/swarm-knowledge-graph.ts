// Swarm Knowledge Graph — persistent adjacency-list graph stored as JSON
// via electronStorage. Tracks files, tasks, patterns, findings, and decisions
// across swarm sessions to enable simulation predictions and historical analysis.
//
// Uses runtime indices (Map-based) for O(1) lookups. Indices are rebuilt from
// arrays on load and maintained incrementally on writes. Arrays remain the
// serialization format for JSON persistence.

import type { KnowledgeGraph, KGNode, KGEdge } from './swarm-types'
import type { CodebaseMap } from './codebase-analyzer'

// ─── Constants ──────────────────────────────────────────────

const KG_STORAGE_KEY = 'swarm-knowledge-graph'
const MAX_NODES = 5000
const MAX_EDGES = 20000
const MAX_AGE_DAYS = 90
const MAX_EDGE_WEIGHT = 100

// ─── Runtime Indices ────────────────────────────────────────
//
// Not serialized — rebuilt on loadGraph(), maintained by CRUD ops.

/** id → KGNode reference (same object as in graph.nodes[]) */
const nodeIndex = new Map<string, KGNode>()
/** "from|to|type" → KGEdge reference */
const edgeIndex = new Map<string, KGEdge>()
/** nodeId → all incident edges (both directions) */
const adjacency = new Map<string, KGEdge[]>()

function edgeKey(from: string, to: string, type: string): string {
  return `${from}|${to}|${type}`
}

function rebuildIndices(graph: KnowledgeGraph): void {
  nodeIndex.clear()
  edgeIndex.clear()
  adjacency.clear()

  for (const node of graph.nodes) {
    nodeIndex.set(node.id, node)
  }

  for (const edge of graph.edges) {
    edgeIndex.set(edgeKey(edge.from, edge.to, edge.type), edge)
    // Adjacency: index by both endpoints
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, [])
    adjacency.get(edge.from)!.push(edge)
    if (edge.from !== edge.to) {
      if (!adjacency.has(edge.to)) adjacency.set(edge.to, [])
      adjacency.get(edge.to)!.push(edge)
    }
  }
}

function addToAdjacency(edge: KGEdge): void {
  if (!adjacency.has(edge.from)) adjacency.set(edge.from, [])
  adjacency.get(edge.from)!.push(edge)
  if (edge.from !== edge.to) {
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, [])
    adjacency.get(edge.to)!.push(edge)
  }
}

// ─── Persistence ────────────────────────────────────────────

function emptyGraph(): KnowledgeGraph {
  return {
    version: 1,
    nodes: [],
    edges: [],
    metadata: {
      lastUpdated: Date.now(),
      totalSwarms: 0,
      totalTasks: 0,
    },
  }
}

export async function loadGraph(): Promise<KnowledgeGraph> {
  try {
    if (typeof window === 'undefined' || !window.ghostshell?.storageGet) {
      const g = emptyGraph()
      rebuildIndices(g)
      return g
    }
    const data = await window.ghostshell.storageGet(KG_STORAGE_KEY)
    if (!data || typeof data !== 'object') {
      const g = emptyGraph()
      rebuildIndices(g)
      return g
    }
    const parsed = data as KnowledgeGraph
    if (!parsed.nodes || !parsed.edges) {
      const g = emptyGraph()
      rebuildIndices(g)
      return g
    }
    rebuildIndices(parsed)
    return parsed
  } catch {
    const g = emptyGraph()
    rebuildIndices(g)
    return g
  }
}

export async function saveGraph(graph: KnowledgeGraph): Promise<void> {
  try {
    if (typeof window === 'undefined' || !window.ghostshell?.storageSet) return
    graph.metadata.lastUpdated = Date.now()
    await window.ghostshell.storageSet(KG_STORAGE_KEY, graph as any)
  } catch (err) {
    console.warn('[knowledge-graph] Failed to save:', err)
  }
}

// ─── CRUD (O(1) via indices) ────────────────────────────────

export function addNode(graph: KnowledgeGraph, node: KGNode): void {
  const existing = nodeIndex.get(node.id)
  if (existing) {
    existing.properties = { ...existing.properties, ...node.properties }
    existing.lastSeen = Date.now()
  } else {
    const newNode = { ...node, lastSeen: Date.now() }
    graph.nodes.push(newNode)
    nodeIndex.set(newNode.id, newNode)
  }
}

export function addEdge(graph: KnowledgeGraph, edge: KGEdge): void {
  const key = edgeKey(edge.from, edge.to, edge.type)
  const existing = edgeIndex.get(key)
  if (existing) {
    existing.weight = Math.min(existing.weight + edge.weight, MAX_EDGE_WEIGHT)
    existing.lastSeen = Date.now()
  } else {
    const newEdge = { ...edge, lastSeen: Date.now(), weight: Math.min(edge.weight, MAX_EDGE_WEIGHT) }
    graph.edges.push(newEdge)
    edgeIndex.set(key, newEdge)
    addToAdjacency(newEdge)
  }
}

export function updateNodeProperty(
  graph: KnowledgeGraph,
  nodeId: string,
  key: string,
  value: unknown,
): void {
  const node = nodeIndex.get(nodeId)
  if (node) {
    node.properties[key] = value
    node.lastSeen = Date.now()
  }
}

export function incrementEdgeWeight(
  graph: KnowledgeGraph,
  fromId: string,
  toId: string,
  type: KGEdge['type'],
): void {
  const key = edgeKey(fromId, toId, type)
  const existing = edgeIndex.get(key)
  if (existing) {
    existing.weight = Math.min(existing.weight + 1, MAX_EDGE_WEIGHT)
    existing.lastSeen = Date.now()
  } else {
    const newEdge: KGEdge = { from: fromId, to: toId, type, weight: 1, lastSeen: Date.now() }
    graph.edges.push(newEdge)
    edgeIndex.set(key, newEdge)
    addToAdjacency(newEdge)
  }
}

// ─── Queries (O(1) node lookup, O(degree) edge queries) ────

export function getNeighbors(
  graph: KnowledgeGraph,
  nodeId: string,
  edgeType?: KGEdge['type'],
): KGNode[] {
  const incident = adjacency.get(nodeId) || []
  const neighborIds = new Set<string>()
  for (const edge of incident) {
    if (edgeType && edge.type !== edgeType) continue
    if (edge.from === nodeId) neighborIds.add(edge.to)
    if (edge.to === nodeId) neighborIds.add(edge.from)
  }
  const result: KGNode[] = []
  for (const id of neighborIds) {
    const node = nodeIndex.get(id)
    if (node) result.push(node)
  }
  return result
}

export function getFileHistory(
  graph: KnowledgeGraph,
  filePath: string,
): { conflicts: number; avgDuration: number; lastAgents: string[] } {
  const fileId = `file:${filePath}`
  const node = nodeIndex.get(fileId)
  if (!node) return { conflicts: 0, avgDuration: 0, lastAgents: [] }

  const incident = adjacency.get(fileId) || []

  // modified_by edges: task→file (from=task, to=file)
  const modifiedByEdges = incident.filter(
    (e) => e.to === fileId && e.type === 'modified_by',
  )

  const lastAgents = modifiedByEdges
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, 5)
    .map((e) => e.from.replace(/^task:[^:]+:/, ''))

  return {
    conflicts: (node.properties.conflictCount as number) || 0,
    avgDuration: (node.properties.avgDuration as number) || 0,
    lastAgents,
  }
}

export function getTaskDurationEstimates(
  graph: KnowledgeGraph,
  likelyFiles: string[],
): number | null {
  if (likelyFiles.length === 0) return null

  const durations: number[] = []
  for (const filePath of likelyFiles) {
    const fileId = `file:${filePath}`
    const incident = adjacency.get(fileId) || []
    // Tasks that modified this file: task→file edges
    const taskEdges = incident.filter(
      (e) => e.to === fileId && e.type === 'modified_by',
    )
    for (const edge of taskEdges) {
      const taskNode = nodeIndex.get(edge.from)
      if (taskNode?.properties.actualDuration) {
        durations.push(taskNode.properties.actualDuration as number)
      }
    }
  }

  if (durations.length === 0) return null
  return durations.reduce((sum, d) => sum + d, 0) / durations.length
}

export function getConflictHistory(
  graph: KnowledgeGraph,
  filePath: string,
): { conflictPartners: string[]; frequency: number } {
  const fileId = `file:${filePath}`
  const fileNode = nodeIndex.get(fileId)

  // Use conflictCount property stored directly on file nodes
  const frequency = (fileNode?.properties.conflictCount as number) || 0

  // Find co_modified partners as conflict partners
  const incident = adjacency.get(fileId) || []
  const coModifiedEdges = incident.filter((e) => e.type === 'co_modified')
  const partners = new Set<string>()
  for (const edge of coModifiedEdges) {
    const partner = edge.from === fileId ? edge.to : edge.from
    partners.add(partner)
  }

  return {
    conflictPartners: [...partners],
    frequency,
  }
}

// ─── Population ─────────────────────────────────────────────

export function ingestCodebaseMap(
  graph: KnowledgeGraph,
  codebaseMap: CodebaseMap,
): void {
  for (const node of codebaseMap.nodes) {
    addNode(graph, {
      id: `file:${node.path}`,
      type: 'file',
      properties: {
        language: node.language,
        linesOfCode: node.linesOfCode,
        complexity: node.complexity,
        gitHotness: node.gitHotness,
        lastModified: node.lastModified,
      },
      lastSeen: Date.now(),
    })
  }

  for (const mod of codebaseMap.modules) {
    addNode(graph, {
      id: `module:${mod.directory}`,
      type: 'module',
      properties: {
        name: mod.name,
        fileCount: mod.files.length,
        description: mod.description,
      },
      lastSeen: Date.now(),
    })
  }

  for (const edge of codebaseMap.edges) {
    if (edge.type === 'import') {
      addEdge(graph, {
        from: `file:${edge.from}`,
        to: `file:${edge.to}`,
        type: 'depends_on',
        weight: 1,
        lastSeen: Date.now(),
      })
    }
  }
}

export function ingestSwarmResults(
  graph: KnowledgeGraph,
  swarmId: string,
  tasks: Array<{ id: string; title: string; ownedFiles: string[]; owner: string; status: string; startedAt?: number; completedAt?: number }>,
  conflicts: Array<{ filePath: string; agents: Array<{ label: string }> }>,
  performanceProfiles: Record<string, { avgTaskDurationMs: number }>,
): void {
  graph.metadata.totalSwarms++

  for (const task of tasks) {
    const taskNodeId = `task:${swarmId}:${task.id}`

    // Prefer real per-task duration over agent average
    let actualDuration: number | undefined
    if (task.startedAt && task.completedAt) {
      actualDuration = (task.completedAt - task.startedAt) / 60000
    } else {
      const profile = performanceProfiles[task.owner]
      actualDuration = profile ? profile.avgTaskDurationMs / 60000 : undefined
    }

    addNode(graph, {
      id: taskNodeId,
      type: 'task',
      properties: {
        title: task.title,
        status: task.status,
        actualDuration,
        owner: task.owner,
        swarmId,
      },
      lastSeen: Date.now(),
    })

    graph.metadata.totalTasks++

    // modified_by edges: task → file
    for (const filePath of task.ownedFiles) {
      addEdge(graph, {
        from: taskNodeId,
        to: `file:${filePath}`,
        type: 'modified_by',
        weight: 1,
        lastSeen: Date.now(),
      })
    }

    // co_modified edges between files in the same task
    for (let i = 0; i < task.ownedFiles.length; i++) {
      for (let j = i + 1; j < task.ownedFiles.length; j++) {
        incrementEdgeWeight(
          graph,
          `file:${task.ownedFiles[i]}`,
          `file:${task.ownedFiles[j]}`,
          'co_modified',
        )
      }
    }
  }

  // Record conflict counts on file nodes
  for (const conflict of conflicts) {
    const fileId = `file:${conflict.filePath}`
    const fileNode = nodeIndex.get(fileId)
    if (fileNode) {
      fileNode.properties.conflictCount = Math.min(
        ((fileNode.properties.conflictCount as number) || 0) + 1,
        MAX_EDGE_WEIGHT,
      )
      fileNode.lastSeen = Date.now()
    }
  }
}

// ─── Maintenance ────────────────────────────────────────────

export function pruneGraph(
  graph: KnowledgeGraph,
  maxNodes: number = MAX_NODES,
  maxAgeDays: number = MAX_AGE_DAYS,
): void {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000

  // Remove old nodes
  graph.nodes = graph.nodes.filter((n) => n.lastSeen >= cutoff)

  // Enforce max nodes by LRU
  if (graph.nodes.length > maxNodes) {
    graph.nodes.sort((a, b) => b.lastSeen - a.lastSeen)
    graph.nodes = graph.nodes.slice(0, maxNodes)
  }

  // Remove edges referencing deleted nodes
  const nodeIds = new Set(graph.nodes.map((n) => n.id))
  graph.edges = graph.edges.filter(
    (e) => nodeIds.has(e.from) && nodeIds.has(e.to),
  )

  // Enforce max edges
  if (graph.edges.length > MAX_EDGES) {
    graph.edges.sort((a, b) => b.lastSeen - a.lastSeen)
    graph.edges = graph.edges.slice(0, MAX_EDGES)
  }

  // Rebuild indices after pruning
  rebuildIndices(graph)
}
