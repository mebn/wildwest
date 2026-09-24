// Shared types and the pure duel-resolution logic (runs on the host phone).

export type Phase = 'lobby' | 'calibrate' | 'duel' | 'results'

export interface Player {
  id: string
  name: string
  emoji: string
  ready: boolean
  connected: boolean
  wins: number
}

export interface Settings {
  steps: number
  /** Max angle (degrees) between the shot and the target for a hit. */
  tolerance: number
}

export interface LobbyState {
  code: string
  phase: Phase
  round: number
  players: Player[]
  settings: Settings
  /** Ids of players taking part in the current round. */
  duelists: string[]
  /** Ids of players whose calibration has arrived this round. */
  calibrated: string[]
}

export interface Anchor {
  /** Heading in the phone's own sensor frame when pointing "forward" at the start. */
  local: number
  /** Real compass heading at the same moment, when the phone has a compass. */
  compass: number | null
}

export interface Shot {
  /** Milliseconds from DRAW! until the trigger was pulled. */
  reaction: number
  /** Heading at the shot minus anchor heading, same sensor frame. */
  turn: number
  /** Elevation of the barrel (top edge of phone), degrees. 0 = level. */
  elevation: number
}

export type Outcome = 'winner' | 'survivor' | 'loser' | 'draw'

export interface ShotReport {
  shooter: string
  reaction: number | null
  target: string | null
  hit: boolean
  /** Degrees off from the nearest living target. */
  missBy: number | null
  reason: 'hit' | 'miss' | 'ground' | 'too-late' | 'no-shot'
}

export interface RoundResult {
  round: number
  outcomes: Record<string, Outcome>
  shots: ShotReport[]
  /** Who got hit by whom. */
  hitBy: Record<string, string>
}

// Messages between phones.
export type ToHost =
  | { t: 'join'; pid: string; name: string; emoji: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'anchor'; round: number; anchor: Anchor }
  | { t: 'shot'; round: number; shot: Shot | null }

export type ToPlayer =
  | { t: 'lobby'; state: LobbyState }
  | { t: 'calibrate'; round: number }
  | { t: 'go'; round: number; steps: number; drawDelay: number }
  | { t: 'result'; result: RoundResult }

export const MAX_ELEVATION = 35
export const SHOT_WINDOW_MS = 8000

export const norm180 = (a: number) => {
  let x = ((a + 180) % 360 + 360) % 360 - 180
  if (x === -180) x = 180
  return x
}
export const norm360 = (a: number) => ((a % 360) + 360) % 360

/**
 * Where everyone stands. Players start back to back and walk straight out
 * along their "forward" heading, so each one ends up on a circle around the
 * start point at the angle they were facing.
 *
 * - 2 players: always exactly opposite. Needs no compass at all.
 * - 3+ players: use real compass headings if every phone has one,
 *   otherwise assume they spread evenly in lobby order (clockwise).
 */
export function standingAngles(ids: string[], anchors: Record<string, Anchor>): Record<string, number> {
  const out: Record<string, number> = {}
  const allCompass = ids.every(id => anchors[id]?.compass != null)
  ids.forEach((id, i) => {
    if (ids.length > 2 && allCompass) out[id] = anchors[id].compass!
    else out[id] = (i * 360) / ids.length
  })
  return out
}

function bearing(from: number, to: number) {
  // Points on a unit circle at compass angles; x = east, y = north.
  const r = Math.PI / 180
  const dx = Math.sin(to * r) - Math.sin(from * r)
  const dy = Math.cos(to * r) - Math.cos(from * r)
  return norm360((Math.atan2(dx, dy) * 180) / Math.PI)
}

export function resolveRound(
  round: number,
  ids: string[],
  anchors: Record<string, Anchor>,
  shots: Record<string, Shot | null>,
  tolerance: number,
): RoundResult {
  const angles = standingAngles(ids, anchors)
  const dead = new Set<string>()
  const hitBy: Record<string, string> = {}
  const hitters = new Set<string>()
  const reports: ShotReport[] = []

  const ordered = ids
    .filter(id => shots[id])
    .sort((a, b) => shots[a]!.reaction - shots[b]!.reaction)

  for (const id of ordered) {
    const shot = shots[id]!
    const base = { shooter: id, reaction: Math.round(shot.reaction) }
    if (dead.has(id)) {
      reports.push({ ...base, target: null, hit: false, missBy: null, reason: 'too-late' })
      continue
    }
    if (Math.abs(shot.elevation) > MAX_ELEVATION) {
      reports.push({ ...base, target: null, hit: false, missBy: null, reason: 'ground' })
      continue
    }
    // Direction of the shot in the shared "circle" frame.
    const aim = norm360(angles[id] + shot.turn)
    let best: string | null = null
    let bestErr = Infinity
    for (const other of ids) {
      if (other === id || dead.has(other)) continue
      const err = Math.abs(norm180(aim - bearing(angles[id], angles[other])))
      if (err < bestErr) { bestErr = err; best = other }
    }
    if (best && bestErr <= tolerance) {
      dead.add(best)
      hitBy[best] = id
      hitters.add(id)
      reports.push({ ...base, target: best, hit: true, missBy: Math.round(bestErr), reason: 'hit' })
    } else {
      reports.push({ ...base, target: best, hit: false, missBy: best ? Math.round(bestErr) : null, reason: 'miss' })
    }
  }
  for (const id of ids) {
    if (!shots[id]) reports.push({ shooter: id, reaction: null, target: null, hit: false, missBy: null, reason: 'no-shot' })
  }

  const outcomes: Record<string, Outcome> = {}
  const alive = ids.filter(id => !dead.has(id))
  for (const id of ids) {
    if (dead.size === 0) outcomes[id] = 'draw'
    else if (dead.has(id)) outcomes[id] = 'loser'
    else if (hitters.has(id) || alive.length === 1) outcomes[id] = 'winner'
    else outcomes[id] = 'survivor'
  }
  return { round, outcomes, shots: reports, hitBy }
}
