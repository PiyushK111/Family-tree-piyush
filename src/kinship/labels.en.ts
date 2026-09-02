import type { Gender, SpouseStatus } from '../types'
import type { BloodRel, Modifier, Relation, Side } from './relations'

export interface LabelPack {
  name: string
  relationLabel(rel: Relation): string
}

interface Triple {
  male: string
  female: string
  neutral: string
}

const pick = (t: Triple, g: Gender): string =>
  g === 'male' ? t.male : g === 'female' ? t.female : t.neutral

const PARENT: Triple = { male: 'Father', female: 'Mother', neutral: 'Parent' }
const CHILD: Triple = { male: 'Son', female: 'Daughter', neutral: 'Child' }
const SIBLING: Triple = { male: 'Brother', female: 'Sister', neutral: 'Sibling' }
const GRANDPARENT: Triple = {
  male: 'Grandfather',
  female: 'Grandmother',
  neutral: 'Grandparent',
}
const GRANDCHILD: Triple = {
  male: 'Grandson',
  female: 'Granddaughter',
  neutral: 'Grandchild',
}
const UNCLE: Triple = { male: 'Uncle', female: 'Aunt', neutral: 'Aunt / Uncle' }
const NEPHEW: Triple = { male: 'Nephew', female: 'Niece', neutral: 'Niece / Nephew' }
const SPOUSE: Triple = { male: 'Husband', female: 'Wife', neutral: 'Spouse' }
const SIBLING_IN_LAW: Triple = {
  male: 'Brother-in-law',
  female: 'Sister-in-law',
  neutral: 'Sibling-in-law',
}
const CHILD_IN_LAW: Triple = {
  male: 'Son-in-law',
  female: 'Daughter-in-law',
  neutral: 'Child-in-law',
}
const PARENT_IN_LAW: Triple = {
  male: 'Father-in-law',
  female: 'Mother-in-law',
  neutral: 'Parent-in-law',
}
const STEP_PARENT: Triple = {
  male: 'Step-Father',
  female: 'Step-Mother',
  neutral: 'Step-Parent',
}
const STEP_CHILD: Triple = {
  male: 'Step-Son',
  female: 'Step-Daughter',
  neutral: 'Step-Child',
}

const ORDINALS = [
  '',
  'First',
  'Second',
  'Third',
  'Fourth',
  'Fifth',
  'Sixth',
  'Seventh',
  'Eighth',
  'Ninth',
  'Tenth',
]

const TIMES = ['', 'Once', 'Twice', 'Three Times', 'Four Times', 'Five Times']

const ordinal = (n: number): string => ORDINALS[n] ?? `${n}th`
const timesWord = (n: number): string => TIMES[n] ?? `${n} Times`

/** "Great-", "Great-Great-", then numeric so deep trees stay readable. */
function greats(n: number): string {
  if (n <= 0) return ''
  if (n <= 3) return 'Great-'.repeat(n)
  return `${n}× Great-`
}

const sidePrefix = (side: Side): string =>
  side === 'paternal' ? 'Paternal ' : side === 'maternal' ? 'Maternal ' : ''

function modifierPrefix(m: Modifier): string {
  switch (m) {
    case 'step':
      return 'Step-'
    case 'half':
      return 'Half-'
    case 'adopted':
      return 'Adopted '
    case 'foster':
      return 'Foster '
    default:
      return ''
  }
}

function spouseNoun(status: SpouseStatus, gender: Gender): string {
  if (status === 'partner') return 'Partner'
  const base = pick(SPOUSE, gender)
  return status === 'divorced' ? `Ex-${base}` : base
}

export function bloodLabel(rel: BloodRel): string {
  const { up, down, gender, side, modifier } = rel
  const mod = modifierPrefix(modifier)

  if (up === 0 && down === 0) return 'Me'

  // Direct ancestors: Father, Grandfather, Great-Grandfather…
  if (down === 0) {
    if (up === 1) return mod + pick(PARENT, gender)
    return sidePrefix(side) + mod + greats(up - 2) + pick(GRANDPARENT, gender)
  }

  // Direct descendants: Son, Grandson, Great-Grandson…
  if (up === 0) {
    if (down === 1) return mod + pick(CHILD, gender)
    return mod + greats(down - 2) + pick(GRANDCHILD, gender)
  }

  if (up === 1 && down === 1) return mod + pick(SIBLING, gender)

  // Uncle, Grand-Uncle, Great-Grand-Uncle…
  if (down === 1) {
    return (
      sidePrefix(side) + mod + greats(up - 3) + (up === 2 ? '' : 'Grand-') + pick(UNCLE, gender)
    )
  }

  // Nephew, Grand-Nephew, Great-Grand-Nephew…
  if (up === 1) {
    return mod + greats(down - 3) + (down === 2 ? '' : 'Grand-') + pick(NEPHEW, gender)
  }

  // Cousins. Degree counts shared-ancestor depth, "removed" the generation gap.
  const degree = Math.min(up, down) - 1
  const removed = Math.abs(up - down)
  let label = `${ordinal(degree)} Cousin`
  if (removed > 0) label += ` ${timesWord(removed)} Removed`
  if (side !== 'none') label += side === 'paternal' ? ' (paternal)' : ' (maternal)'
  return label
}

/** Someone who married one of ego's blood relatives. */
function spouseOfLabel(via: BloodRel, status: SpouseStatus, gender: Gender): string {
  const former = status === 'divorced' ? 'Former ' : ''
  const { up, down } = via

  if (up === 1 && down === 1) return former + pick(SIBLING_IN_LAW, gender)
  if (up === 0 && down === 1) return former + pick(CHILD_IN_LAW, gender)
  // My parent's spouse who isn't my other parent.
  if (up === 1 && down === 0) return pick(STEP_PARENT, gender)
  // An aunt or uncle by marriage rather than by blood.
  if (up === 2 && down === 1) {
    return `${former}${sidePrefix(via.side)}${pick(UNCLE, gender)} (by marriage)`
  }
  return `${spouseNoun(status, gender)} of ${bloodLabel(via)}`
}

/** A blood relative of ego's spouse. `via` describes them relative to that spouse. */
function spouseSideLabel(
  via: BloodRel,
  spouseStatus: SpouseStatus,
  spouseGender: Gender,
): string {
  const { up, down, gender } = via

  if (up === 1 && down === 0) return pick(PARENT_IN_LAW, gender)
  if (up === 1 && down === 1) return pick(SIBLING_IN_LAW, gender)
  // My spouse's child from elsewhere.
  if (up === 0 && down === 1) return pick(STEP_CHILD, gender)

  return `${spouseNoun(spouseStatus, spouseGender)}'s ${bloodLabel(via)}`
}

export function relationLabel(rel: Relation): string {
  switch (rel.kind) {
    case 'self':
      return 'Me'
    case 'blood':
      return bloodLabel(rel)
    case 'spouse':
      return spouseNoun(rel.status, rel.gender)
    case 'spouse-of':
      return spouseOfLabel(rel.via, rel.status, rel.gender)
    case 'spouse-side':
      return spouseSideLabel(rel.via, rel.spouseStatus, rel.spouseGender)
    case 'unrelated':
      return 'Relative'
  }
}

export const english: LabelPack = { name: 'English', relationLabel }
