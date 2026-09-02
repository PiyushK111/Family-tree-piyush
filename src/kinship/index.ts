import { english, type LabelPack } from './labels.en'
import { computeRelations } from './relations'
import type { FamilyGraph } from './graph'

export { buildGraph, children, parents, spouses } from './graph'
export type { FamilyGraph, ParentEdge, SpouseEdge } from './graph'
export { computeRelations, ancestorsOf } from './relations'
export type { BloodRel, Modifier, Relation, Side } from './relations'
export { bloodLabel, english, relationLabel } from './labels.en'
export type { LabelPack } from './labels.en'

/**
 * Display label for every person relative to `egoId`. A person's own
 * `relationOverride` wins, so a regional term like "Kaka" can replace the
 * computed "Paternal Uncle".
 */
export function relationLabels(
  g: FamilyGraph,
  egoId: string,
  pack: LabelPack = english,
): Map<string, string> {
  const out = new Map<string, string>()
  for (const [id, rel] of computeRelations(g, egoId)) {
    const override = g.people.get(id)?.relationOverride?.trim()
    out.set(id, override || pack.relationLabel(rel))
  }
  return out
}
