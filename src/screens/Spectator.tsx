// Big-screen host: runs the duel and shows everything live. Players use phones.

import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { LivePose, LobbyState, Player } from '../game'
import { HOLSTER_MS, STEP_MS, TURN_MS, type LiveView } from '../host'
import type { Session } from '../session'
import { sfx } from '../sound'
import { Avatar, Bubble, Button, Chips } from '../ui'
import Arena from './Arena'
import { Confetti, ShotLine } from './Results'

const EMPTY: LiveView = { poses: {}, angles: null, reactions: {} }

/** Re-reads the host's live data ~10 times a second. */
function useLive(session: Session): LiveView {
  const [live, setLive] = useState<LiveView>(EMPTY)
  const read = session.host?.live
  useEffect(() => {
    if (!read) return
    const id = setInterval(() => setLive(read()), 100)
    return () => clearInterval(id)
  }, [read])
  return live
}

type WalkStage = { k: 'holster' } | { k: 'step'; n: number } | { k: 'turn' } | { k: 'draw' }

/** Mirrors the phones' walk timeline, starting when the host sent "go". */
function useWalk(session: Session, lobby: LobbyState, sound: boolean) {
  const [stage, setStage] = useState<WalkStage>({ k: 'holster' })
  const cue = session.cue
  const soundRef = useRef(sound)
  soundRef.current = sound
  useEffect(() => {
    if (cue?.t !== 'go' || cue.round !== lobby.round) return
    const play = (fn: () => void) => { if (soundRef.current) fn() }
    setStage({ k: 'holster' })
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 0; i < cue.steps; i++) {
      timers.push(setTimeout(() => { setStage({ k: 'step', n: i + 1 }); play(sfx.step) }, HOLSTER_MS + i * STEP_MS))
    }
    const turnAt = HOLSTER_MS + cue.steps * STEP_MS
    timers.push(setTimeout(() => { setStage({ k: 'turn' }); play(sfx.tick) }, turnAt))
    timers.push(setTimeout(() => { setStage({ k: 'draw' }); play(sfx.draw) }, turnAt + TURN_MS + cue.drawDelay))
    return () => timers.forEach(clearTimeout)
  }, [cue, lobby.round])
  return stage
}

export default function Spectator({ session, lobby }: { session: Session; lobby: LobbyState }) {
  const host = session.host
  const live = useLive(session)
  const [sound, setSound] = useState(true)
  const stage = useWalk(session, lobby, sound)
  const joinUrl = `${location.origin}${location.pathname}?room=${lobby.code}`
  const connected = lobby.players.filter(p => p.connected)
  const duelists = lobby.players.filter(p => lobby.duelists.includes(p.id))
  const result = session.result?.round === lobby.round ? session.result : null
  const inRound = lobby.phase !== 'lobby'

  // A bang on the big screen for every shot fired.
  const firedCount = lobby.fired.length
  useEffect(() => { if (firedCount && sound) sfx.bang() }, [firedCount])
  useEffect(() => {
    if (lobby.phase === 'results' && result && sound) {
      if (Object.values(result.outcomes).includes('winner')) sfx.win()
      else sfx.boing()
    }
  }, [lobby.phase, result?.round])

  const winners = result ? lobby.players.filter(p => result.outcomes[p.id] === 'winner') : []
  const sidebarPlayers = inRound ? duelists : lobby.players

  return (
    <>
      {winners.length > 0 && lobby.phase === 'results' && <Confetti />}
      <header className="spec-header">
        <h1 className="spec-title">🤠 Wild West <span>DUEL!</span></h1>
        <div className="spec-code">
          <span className="muted">Join code</span> <b>{lobby.code}</b>
        </div>
        <button className="chip" onClick={() => setSound(s => !s)}>{sound ? '🔊 Sound on' : '🔇 Sound off'}</button>
      </header>

      <div className="spec-grid">
        <div className="spec-main">
          {lobby.phase === 'lobby' && (
            <Bubble className="spec-join">
              <div className="spec-qr">
                <QRCodeSVG value={joinUrl} size={220} bgColor="transparent" fgColor="#5a2d0c" />
              </div>
              <div>
                <h2>Scan to join!</h2>
                <p>Or open <b className="url">{joinUrl.replace(/^https?:\/\//, '').replace(/\?.*$/, '')}</b> and type</p>
                <div className="code">{lobby.code}</div>
              </div>
            </Bubble>
          )}

          {lobby.phase === 'lobby' && host && (
            <Bubble>
              <h2>Duel rules</h2>
              <div className="label">Steps to walk</div>
              <Chips
                value={lobby.settings.steps}
                options={[3, 5, 7, 10].map(n => ({ value: n, label: `${n} 👣` }))}
                onChange={steps => host.setSettings({ steps })}
              />
              <div className="label">Aim</div>
              <Chips
                value={lobby.settings.tolerance}
                options={[
                  { value: 30, label: 'Easy 🐣' },
                  { value: 20, label: 'Normal 🤠' },
                  { value: 12, label: 'Sharp 🦅' },
                ]}
                onChange={tolerance => host.setSettings({ tolerance })}
              />
              <Button big color="orange" disabled={!host.canStart} onClick={host.start} className="start-btn">
                {host.canStart ? 'Everyone back to back? START! 🔫' : connected.length < 2 ? 'Waiting for 2+ cowpokes…' : 'Waiting for everyone to be ready…'}
              </Button>
            </Bubble>
          )}

          {lobby.phase === 'calibrate' && (
            <Bubble className="spec-stage">
              <div className="big-emoji bounce">🤝</div>
              <h2 className="spec-big">Back to back!</h2>
              <p>Everyone points their phone forward, level, until it locks in.</p>
              <p className="spec-count">{lobby.calibrated.length} / {duelists.length} locked in</p>
              {host && <button className="link" onClick={host.backToLobby}>Cancel round</button>}
            </Bubble>
          )}

          {lobby.phase === 'duel' && (
            <Bubble className={`spec-stage ${stage.k === 'draw' ? 'spec-draw' : ''}`}>
              {stage.k === 'holster' && <h2 className="spec-big">👖 Phones in pockets!</h2>}
              {stage.k === 'step' && (
                <>
                  <div key={stage.n} className="step-num pop-in">{stage.n}</div>
                  <div className="feet">{'👣'.repeat(stage.n)}</div>
                </>
              )}
              {stage.k === 'turn' && <h2 className="spec-big shake">🔄 Turn around… wait for it…</h2>}
              {stage.k === 'draw' && <div className="draw-word">DRAW!</div>}
            </Bubble>
          )}

          {lobby.phase === 'results' && result && (
            <Bubble className="result-banner win">
              <div className="big-emoji pop-in">{winners.length ? '🏆' : '🌵'}</div>
              <h1>{winners.length ? `${winners.map(w => `${w.emoji} ${w.name}`).join(' & ')} wins!` : 'Everybody missed!'}</h1>
            </Bubble>
          )}

          {(lobby.phase === 'duel' || (lobby.phase === 'results' && result)) && (live.angles || result) && (
            <Bubble className="arena-card">
              <Arena
                players={lobby.players}
                angles={result?.positions ?? live.angles ?? {}}
                live={lobby.phase === 'duel' ? live : undefined}
                result={lobby.phase === 'results' ? result ?? undefined : undefined}
                tolerance={lobby.settings.tolerance}
              />
              <p className="muted small center">
                {lobby.phase === 'duel'
                  ? 'Seen from above. Arrows show where each phone points; the cone lights up green when it is on target.'
                  : 'Solid line = hit, dashed = miss.'}
              </p>
            </Bubble>
          )}

          {lobby.phase === 'results' && host && (
            <Button big color="orange" onClick={host.backToLobby}>Next round: back to the start! 🤝</Button>
          )}
        </div>

        <aside className="spec-side">
          <Bubble>
            <h2>{inRound ? 'Duelists' : `Cowpokes (${connected.length})`}</h2>
            {sidebarPlayers.length === 0 && <p className="muted">Nobody here yet. Scan the code with a phone!</p>}
            <div className="live-cards">
              {sidebarPlayers.map(p => (
                <LiveCard key={p.id} player={p} pose={live.poses[p.id]} lobby={lobby} reaction={live.reactions[p.id]} />
              ))}
            </div>
          </Bubble>

          {result && lobby.phase === 'results' && (
            <Bubble>
              <h2>What happened</h2>
              <ul className="shots">
                {result.shots.map(s => <ShotLine key={s.shooter} s={s} byId={Object.fromEntries(lobby.players.map(p => [p.id, p]))} />)}
              </ul>
            </Bubble>
          )}

          <Scoreboard players={lobby.players} />
        </aside>
      </div>
    </>
  )
}

function poseState(pose: LivePose | undefined) {
  if (!pose || performance.now() - pose.t > 1500) return { label: '📵 No sensor data', cls: 'none' }
  const e = Math.abs(pose.elevation)
  if (e < 35) return { label: '🔫 Raised', cls: 'raised' }
  if (e > 55) return { label: '👖 Holstered', cls: 'holstered' }
  return { label: '〰️ Moving', cls: 'moving' }
}

function LiveCard({ player, pose, lobby, reaction }: {
  player: Player
  pose: LivePose | undefined
  lobby: LobbyState
  reaction: number | undefined
}) {
  const state = poseState(pose)
  const heading = pose ? (pose.turn ?? pose.compass ?? pose.heading) : 0
  let badge = player.ready ? '✅ Ready' : '⏳ Not ready'
  if (!player.connected) badge = '💤 Offline'
  else if (lobby.phase === 'calibrate') badge = lobby.calibrated.includes(player.id) ? '🔒 Locked in' : '🎯 Calibrating'
  else if (lobby.phase === 'duel') badge = reaction != null ? `💥 Fired ${(reaction / 1000).toFixed(2)}s` : '🤫 Waiting'

  return (
    <div className={`live-card ${player.connected ? '' : 'offline'} pose-${state.cls}`}>
      <Avatar emoji={player.emoji} />
      <div className="live-info">
        <div className="pname">{player.name}</div>
        <div className="small">{badge}</div>
        <div className="small muted">{state.label}</div>
      </div>
      <div className="gauges" title="Direction and tilt">
        <Dial deg={heading} label={pose?.turn != null ? 'turn' : 'dir'} value={pose ? Math.round(pose.turn ?? heading) : null} />
        <Tilt elevation={pose?.elevation ?? null} />
      </div>
    </div>
  )
}

/** Compass-style dial. After calibration it shows how far the player has turned. */
function Dial({ deg, label, value }: { deg: number; label: string; value: number | null }) {
  return (
    <div className="gauge">
      <svg viewBox="-22 -22 44 44" className="dial">
        <circle r="19" className="dial-face" />
        <g style={{ transform: `rotate(${deg}deg)` }} className="dial-needle">
          <polygon points="0,-16 4,2 -4,2" />
        </g>
        <circle r="3" className="dial-hub" />
      </svg>
      <span className="gauge-label">{value == null ? '–' : `${value}°`} <em>{label}</em></span>
    </div>
  )
}

/** Tilt meter: the dot is level in the middle, up = pointing at the sky. */
function Tilt({ elevation }: { elevation: number | null }) {
  const y = elevation == null ? 0 : -(Math.max(-90, Math.min(90, elevation)) / 90) * 20
  return (
    <div className="gauge">
      <svg viewBox="-8 -24 16 48" className="tilt">
        <rect x="-6" y="-22" width="12" height="44" rx="6" className="tilt-tube" />
        <rect x="-6" y="-8" width="12" height="16" className="tilt-zone" />
        {elevation != null && <circle cy={y} r="5" className="tilt-dot" />}
      </svg>
      <span className="gauge-label">{elevation == null ? '–' : `${Math.round(elevation)}°`} <em>tilt</em></span>
    </div>
  )
}

function Scoreboard({ players }: { players: Player[] }) {
  const sorted = useMemo(() => [...players].sort((a, b) => b.wins - a.wins), [players])
  if (!sorted.some(p => p.wins)) return null
  return (
    <Bubble>
      <h2>Scoreboard</h2>
      <ul className="players compact">
        {sorted.map(p => (
          <li key={p.id} className="player">
            <Avatar emoji={p.emoji} size="sm" />
            <span className="pname">{p.name}</span>
            <span className="wins">⭐ {p.wins}</span>
          </li>
        ))}
      </ul>
    </Bubble>
  )
}
