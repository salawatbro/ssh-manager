import type { PaneNode } from '../stores/sessions'

// replaceLeaf swaps the leaf matching paneId for whatever make() returns
// (used to split it into a two-child split node). Non-matching nodes are
// returned structurally unchanged.
export function replaceLeaf(node: PaneNode, paneId: string, make: (leaf: PaneNode) => PaneNode): PaneNode {
  if (node.kind === 'leaf') return node.id === paneId ? make(node) : node
  return { ...node, a: replaceLeaf(node.a, paneId, make), b: replaceLeaf(node.b, paneId, make) }
}

// removeLeaf drops the leaf matching paneId and collapses its parent split by
// promoting the surviving sibling. Returns null if the whole tree WAS that leaf
// (the caller then closes the tab).
export function removeLeaf(node: PaneNode, paneId: string): PaneNode | null {
  if (node.kind === 'leaf') return node.id === paneId ? null : node
  const a = removeLeaf(node.a, paneId)
  const b = removeLeaf(node.b, paneId)
  if (a === null) return b
  if (b === null) return a
  return { ...node, a, b }
}

// firstLeaf returns the tree's left-most leaf — the fallback focus target after
// the focused pane is removed.
export function firstLeaf(node: PaneNode): PaneNode {
  return node.kind === 'leaf' ? node : firstLeaf(node.a)
}
