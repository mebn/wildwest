// Top-down view of the duel: everyone stands on a circle around the start
// point. Shows live aim cones while dueling and the shot lines afterwards.

import { bearing, MAX_ELEVATION, norm180, norm360, type Player, type RoundResult } from '../game'
import type { LiveView } from '../host'

const R = 70
const RAD = Math.PI / 180
const polar = (deg: number, r: number) => [r * Math.sin(deg * RAD), -r * Math.cos(deg * RAD)] as const

export default function Arena({ players, angles, live, result, tolerance }: {
  players: Player[]
  angles: Record<string, number>
  live?: LiveView
  result?: RoundResult
  tolerance: number
}) {
  const ids = Object.keys(angles)
  const byId = Object.fromEntries(players.map(p => [p.id, p]))
  const dead = new Set(Object.keys(result?.hitBy ?? {}))
  const pos = (id: string) => polar(angles[id], R)

  return (
    <svg className="arena" viewBox="-120 -120 240 240" role="img" aria-label="Duel arena seen from above">
      <circle r="112" className="arena-ground" />
      <circle r={R} className="arena-ring" />
      {ids.map(id => {
        const [x, y] = pos(id)
        return <line key={`walk-${id}`} x1="0" y1="0" x2={x} y2={y} className="arena-walk" />
      })}
      <text className="arena-start" x="0" y="0">🤝</text>

      {/* Live aim cones */}
      {live && ids.map(id => {
        const pose = live.poses[id]
        if (!pose || pose.turn == null || id in live.reactions) return null
        const aim = norm360(angles[id] + pose.turn)
        const raised = Math.abs(pose.elevation) < MAX_ELEVATION
        const onTarget = raised && ids.some(o => o !== id && Math.abs(norm180(aim - bearing(angles[id], angles[o]))) <= tolerance)
        const [x, y] = pos(id)
        const [ax, ay] = polar(aim - tolerance, 170)
        const [bx, by] = polar(aim + tolerance, 170)
        const [tx, ty] = polar(aim, 34)
        return (
          <g key={`aim-${id}`} className={`aim ${raised ? 'raised' : 'lowered'} ${onTarget ? 'on-target' : ''}`}>
            {raised && <polygon points={`${x},${y} ${x + ax},${y + ay} ${x + bx},${y + by}`} className="aim-cone" />}
            <line x1={x} y1={y} x2={x + tx} y2={y + ty} className="aim-line" />
          </g>
        )
      })}

      {/* Final shots */}
      {result?.shots.map(s => {
        if (s.aim == null || !(s.shooter in angles)) return null
        const [x, y] = pos(s.shooter)
        if (s.hit && s.target) {
          const [tx, ty] = pos(s.target)
          return <line key={`shot-${s.shooter}`} x1={x} y1={y} x2={tx} y2={ty} className="shot-line hit" />
        }
        const [dx, dy] = polar(s.aim, 240)
        return <line key={`shot-${s.shooter}`} x1={x} y1={y} x2={x + dx} y2={y + dy} className="shot-line miss" />
      })}

      {/* Players */}
      {ids.map(id => {
        const p = byId[id]
        const [x, y] = pos(id)
        const reaction = live?.reactions[id]
        return (
          <g key={id} className={`arena-player ${dead.has(id) ? 'dead' : ''} ${result?.outcomes[id] ?? ''}`}>
            <circle cx={x} cy={y} r="15" className="arena-badge" />
            <text x={x} y={y} className="arena-emoji">{p?.emoji ?? '❓'}</text>
            <text x={x} y={y + 25} className="arena-name">{p?.name ?? '?'}</text>
            {dead.has(id) && <text x={x + 12} y={y - 12} className="arena-mark">💫</text>}
            {result?.outcomes[id] === 'winner' && <text x={x + 12} y={y - 12} className="arena-mark">🏆</text>}
            {reaction != null && !result && (
              <>
                <text x={x + 13} y={y - 13} className="arena-mark">💥</text>
                <text x={x} y={y - 22} className="arena-time">{(reaction / 1000).toFixed(2)}s</text>
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
