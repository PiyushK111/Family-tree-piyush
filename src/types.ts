export type Gender = 'male' | 'female' | 'other' | 'unknown'

/** How a parent is related to a child. Drives "Step-Father", "Adopted Son", etc. */
export type ParentKind = 'biological' | 'adopted' | 'step' | 'foster'

export type SpouseStatus = 'married' | 'divorced' | 'partner'

export interface Person {
  id: string
  name: string
  gender: Gender
  /** ISO `yyyy-mm-dd`, or just `yyyy` when only the year is known. */
  birthDate?: string
  deathDate?: string
  deceased: boolean
  birthPlace?: string
  currentCity?: string
  phone?: string
  email?: string
  notes?: string
  /** Wins over the computed kinship label when set (e.g. a regional term). */
  relationOverride?: string
  hasPhoto: boolean
}

export interface ParentLink {
  id: string
  type: 'parent'
  /** The parent. */
  from: string
  /** The child. */
  to: string
  kind: ParentKind
}

export interface SpouseLink {
  id: string
  type: 'spouse'
  /** Unordered pair; `from`/`to` carry no directional meaning. */
  from: string
  to: string
  status: SpouseStatus
  /** Year or ISO date of marriage, shown on the spouse edge. */
  since?: string
}

export type Link = ParentLink | SpouseLink

export interface TreeMeta {
  id: string
  name: string
  /** The person at the centre of the tree — "Me". */
  rootPersonId: string
  ownerEmail: string
  /** Emails allowed to write. Enforced in firestore.rules, not here. */
  editors: string[]
}

/** A blank person, used as the starting point for the add/edit dialog. */
export function emptyPerson(): Omit<Person, 'id'> {
  return { name: '', gender: 'unknown', deceased: false, hasPhoto: false }
}
