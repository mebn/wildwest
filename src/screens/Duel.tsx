import { useEffect, useRef, useState } from 'react'
import { MAX_ELEVATION, norm180, SHOT_WINDOW_MS, type Anchor, type Shot } from '../game'
import { HOLSTER_MS, STEP_MS, TURN_MS } from '../host'
import { buzz, getPose, onKick, usePose, type Pose } from '../motion'
import type { RoundCue, Session } from '../session'
import { say, sfx } from '../sound'

type Stage =
  | { k: 'holster' }
  | { k: 'step'; n: number }
  | { k: 'turn' }
  | { k: 'draw' }
  | { k: 'fired'; shot: Shot | null }

const NUMBERS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']

export default function Duel({ session, cue, anchor }: {
  session: Session
  cue: Extract<RoundCue, { t: 'go' }>
  anchor: Anchor | null
}) {
  const [stage, setStage] = useState<Stage>({ k: 'holster' })
  const drawAt = useRef(0)
  const fired = useRef(false)

  // The whole walk is timed locally from the moment the host says "go",
  // so a slow network can't make anyone draw early.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))
    say('Phones in pockets!')
    for (let i = 0; i < cue.steps; i++) {
      at(HOLSTER_MS + i * STEP_MS, () => {
        setStage({ k: 'step', n: i + 1 })
        sfx.step()
        buzz(60)
        say(NUMBERS[i] ?? String(i + 1), 1.2)
      })
    }
    const turnAt = HOLSTER_MS + cue.steps * STEP_MS
    at(turnAt, () => { setStage({ k: 'turn' }); say('Turn around!'); buzz([40, 60, 40]) })
    at(turnAt + TURN_MS + cue.drawDelay, () => {
      drawAt.current = performance.now()
      setStage({ k: 'draw' })
      sfx.draw()
      say('Draw!', 1.3)
      buzz(300)
      at(SHOT_WINDOW_MS, () => fire(null))
    })
    return () => timers.forEach(clearTimeout)
  }, [])

  const fire = (pose: Pose | null) => {
    if (fired.current) return
    fired.current = true
    let shot: Shot | null = null
    if (pose) {
      shot = {
        reaction: performance.now() - drawAt.current,
        turn: norm180(pose.heading - (anchor?.local ?? pose.heading)),
        elevation: pose.elevation,
      }
      sfx.bang()
      buzz([30, 30, 120])
    }
    setStage({ k: 'fired', shot })
    session.send({ t: 'shot', round: cue.round, shot })
  }

  // Shooting: tap anywhere, or flick the phone up like recoil.
  useEffect(() => {
    if (stage.k !== 'draw') return
    const off = onKick(p => fire(p))
    return off
  }, [stage.k])

  if (stage.k === 'draw') return <DrawScreen onShoot={() => fire(getPose())} />

  if (stage.k === 'fired') {
    return (
      <div className="duel-screen fired">
        {stage.shot ? (
          <>
            <div className="pow">BANG!</div>
            <p className="duel-sub">{(stage.shot.reaction / 1000).toFixed(2)}s</p>
          </>
        ) : (
          <>
            <div className="big-emoji wobble">🐢</div>
            <p className="duel-sub">Too slow, partner!</p>
          </>
        )}
        <p className="muted">Waiting for the dust to settle… 🌪️</p>
      </div>
    )
  }

  return (
    <div className="duel-screen walking">
      {stage.k === 'holster' && (
        <>
          <div className="big-emoji bounce">👖</div>
          <h2 className="duel-title">Phone in pocket!</h2>
          <p className="duel-sub">Listen for the steps…</p>
        </>
      )}
      {stage.k === 'step' && (
        <>
          <div key={stage.n} className="step-num pop-in">{stage.n}</div>
          <div className="feet">{'👣'.repeat(stage.n)}</div>
          <p className="duel-sub">Walk!</p>
        </>
      )}
      {stage.k === 'turn' && (
        <>
          <div className="big-emoji spin-once">🔄</div>
          <h2 className="duel-title">Turn around!</h2>
          <p className="duel-sub shake">Wait for it…</p>
        </>
      )}
    </div>
  )
}

function DrawScreen({ onShoot }: { onShoot: () => void }) {
  const pose = usePose()
  const raised = Math.abs(pose.elevation) < MAX_ELEVATION
  return (
    <div
      className={`duel-screen draw ${raised ? 'raised' : ''}`}
      onPointerDown={e => { e.preventDefault(); onShoot() }}
    >
      <div className="draw-word">DRAW!</div>
      <div className="crosshair">
        <div className="ring r1" />
        <div className="ring r2" />
        <div className="dot" />
      </div>
      <p className="duel-sub">{raised ? 'Aim the top of your phone… TAP to shoot!' : 'Raise your phone! ⬆️'}</p>
    </div>
  )
}
