import { useEffect, useRef, useState, type RefObject } from 'react'
import { norm180, type Anchor, type LobbyState } from '../game'
import { averagePose, buzz, getPose, usePose } from '../motion'
import type { Session } from '../session'
import { sfx } from '../sound'
import { Avatar, Bubble, Button } from '../ui'

const HOLD_MS = 1200
const LEVEL = 20

export default function Calibrate({ session, lobby, anchor }: {
  session: Session
  lobby: LobbyState
  anchor: RefObject<Anchor | null>
}) {
  const pose = usePose()
  const [progress, setProgress] = useState(0)
  const [locked, setLocked] = useState(false)
  const since = useRef<{ t: number; heading: number } | null>(null)
  const duelists = lobby.players.filter(p => lobby.duelists.includes(p.id))
  const level = Math.abs(pose.elevation) < LEVEL

  const lock = () => {
    if (locked) return
    const p = averagePose(700)
    const a: Anchor = { local: p.heading, compass: p.compass }
    anchor.current = a
    setLocked(true)
    sfx.tick()
    buzz(80)
    session.send({ t: 'anchor', round: lobby.round, anchor: a })
  }

  // Auto-lock once the phone has been held level and still for a moment.
  useEffect(() => {
    if (locked) return
    const id = setInterval(() => {
      const p = getPose()
      const now = performance.now()
      const ok = Math.abs(p.elevation) < LEVEL
      if (!ok || (since.current && Math.abs(norm180(p.heading - since.current.heading)) > 12)) {
        since.current = ok ? { t: now, heading: p.heading } : null
        setProgress(0)
        return
      }
      if (!since.current) since.current = { t: now, heading: p.heading }
      const prog = Math.min(1, (now - since.current.t) / HOLD_MS)
      setProgress(prog)
      if (prog >= 1) lock()
    }, 80)
    return () => clearInterval(id)
  }, [locked])

  if (locked) {
    return (
      <Bubble className="center-card">
        <div className="big-emoji bounce">🤝</div>
        <h2>Locked in!</h2>
        <p>Stay back to back… waiting for the others</p>
        <ul className="players compact">
          {duelists.map(p => (
            <li key={p.id} className="player">
              <Avatar emoji={p.emoji} size="sm" />
              <span className="pname">{p.name}</span>
              <span>{lobby.calibrated.includes(p.id) ? '✅' : '⏳'}</span>
            </li>
          ))}
        </ul>
        {session.host && <button className="link" onClick={session.host.backToLobby}>Cancel round</button>}
      </Bubble>
    )
  }

  // Bubble level: the dot drifts up/down with the phone's tilt.
  const offset = Math.max(-1, Math.min(1, pose.elevation / 45))
  return (
    <Bubble className="center-card">
      <h2>Back to back! 🤝</h2>
      <p>Point your phone <b>forward</b>, the way you'll walk.<br />Screen up, top edge pointing ahead. Hold still…</p>
      <div className="aim-picture" aria-hidden>
        <span className="aim-phone">📱</span>
        <span className="aim-arrow">⬆️</span>
      </div>
      <div className={`level ${level ? 'ok' : ''}`}>
        <div className="level-mark" />
        <div className="level-dot" style={{ transform: `translateY(${-offset * 60}px)` }} />
      </div>
      <div className="hold-bar"><div style={{ width: `${progress * 100}%` }} /></div>
      <p className="muted">{level ? (progress > 0 ? 'Hold it…' : 'Nice and level!') : pose.elevation > 0 ? 'Tip the top down a bit ⬇️' : 'Tip the top up a bit ⬆️'}</p>
      <Button color="blue" disabled={!level} onClick={lock}>Lock it now</Button>
      {session.host && <button className="link" onClick={session.host.backToLobby}>Cancel round</button>}
    </Bubble>
  )
}
