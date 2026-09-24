import { useCallback, useEffect, useRef, useState } from 'react'
import { norm180, type Anchor } from './game'
import { getPose, sensorsStarted, SIM } from './motion'
import { useSession, type JoinRequest } from './session'
import Home, { clearRoomParam } from './screens/Home'
import Lobby from './screens/Lobby'
import Calibrate from './screens/Calibrate'
import Duel from './screens/Duel'
import Results from './screens/Results'
import SimPanel from './screens/SimPanel'
import Spectator from './screens/Spectator'
import { sfx } from './sound'
import { Bubble, Button } from './ui'

export default function App() {
  const [req, setReq] = useState<JoinRequest | null>(null)
  const leave = useCallback(() => { clearRoomParam(); setReq(null) }, [])
  const session = useSession(req, leave)
  const anchor = useRef<Anchor | null>(null)
  // Hide the exit button mid-duel so a stray tap in the pocket can't quit.
  const duelRunning = session?.lobby?.phase === 'duel' && session.lobby.duelists.includes(session.pid)
  const phase = session?.lobby?.phase

  // A new round needs a fresh calibration, so forget the old direction.
  useEffect(() => { if (phase === 'lobby') anchor.current = null }, [phase])

  // When a big screen is hosting, stream this phone's aim and tilt to it.
  const watching = !!session?.lobby?.watching && !session.spectator
  const send = session?.send
  useEffect(() => {
    if (!watching || !send) return
    const id = setInterval(() => {
      if (!sensorsStarted()) return
      const p = getPose()
      const a = anchor.current
      send({
        t: 'pose',
        pose: { heading: p.heading, compass: p.compass, elevation: p.elevation, turn: a ? norm180(p.heading - a.local) : null },
      })
    }, 100)
    return () => clearInterval(id)
  }, [watching, send])

  return (
    <div className="app">
      <Sky />
      <main className={`stage ${session?.spectator ? 'wide' : ''} ${session || new URLSearchParams(location.search).has('room') ? 'with-exit' : ''}`}>{screen()}</main>
      {session && !duelRunning && <ExitButton isHost={session.role === 'host'} onExit={session.leave} />}
      {SIM && <SimPanel />}
    </div>
  )

  function screen() {
    if (!session) return <Home onJoin={setReq} />
    const { lobby, status, error } = session
    if (status === 'error' || (!lobby && status !== 'online' && error)) {
      return (
        <Bubble className="center-card">
          <div className="big-emoji wobble">🌵</div>
          <h2>Uh oh, partner!</h2>
          <p>{error ?? 'Could not connect.'}</p>
          <Button onClick={session.leave}>Back to town</Button>
        </Bubble>
      )
    }
    if (!lobby) {
      return (
        <Bubble className="center-card">
          <div className="big-emoji spin-slow">🐴</div>
          <h2>Riding into town…</h2>
          <p className="muted">Connecting{req?.code ? ` to ${req.code}` : ''}</p>
        </Bubble>
      )
    }
    if (session.spectator) return <Spectator session={session} lobby={lobby} />
    const inRound = lobby.duelists.includes(session.pid)
    const banner = status === 'lost' ? <div className="lost-banner">📡 Lost connection, reconnecting…</div> : null

    if (lobby.phase === 'lobby') return <>{banner}<Lobby session={session} lobby={lobby} /></>
    if (lobby.phase === 'results' && session.result?.round === lobby.round) {
      return <>{banner}<Results session={session} lobby={lobby} result={session.result} /></>
    }
    if (!inRound) {
      return (
        <Bubble className="center-card">
          <div className="big-emoji wobble">🍿</div>
          <h2>A duel is on!</h2>
          <p className="muted">You'll join the next round.</p>
        </Bubble>
      )
    }
    const cue = session.cue
    if (lobby.phase === 'calibrate' || cue?.t !== 'go' || cue.round !== lobby.round) {
      return <>{banner}<Calibrate key={lobby.round} session={session} lobby={lobby} anchor={anchor} /></>
    }
    return <>{banner}<Duel key={cue.round} session={session} cue={cue} anchor={anchor.current} /></>
  }
}

function ExitButton({ isHost, onExit }: { isHost: boolean; onExit: () => void }) {
  const [asking, setAsking] = useState(false)
  return (
    <>
      <button className="exit-btn" aria-label="Exit room" onClick={() => { sfx.pop(); setAsking(true) }}>
        🚪 Exit
      </button>
      {asking && (
        <div className="modal-backdrop" onClick={() => setAsking(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <Bubble>
              <div className="big-emoji wobble">🐴</div>
              <h2>Ride off into the sunset?</h2>
              <p>{isHost ? 'You are the host. Leaving ends the game for everyone!' : 'You can join again with the same code.'}</p>
              <div className="modal-actions">
                <Button color="plain" onClick={() => setAsking(false)}>Stay</Button>
                <Button color="pink" onClick={onExit}>{isHost ? 'End game' : 'Leave'}</Button>
              </div>
            </Bubble>
          </div>
        </div>
      )}
    </>
  )
}

function Sky() {
  return (
    <div className="sky" aria-hidden>
      <div className="sun" />
      <div className="cloud c1" />
      <div className="cloud c2" />
      <div className="mesa m1" />
      <div className="mesa m2" />
      <div className="ground" />
      <div className="tumbleweed">🌾</div>
    </div>
  )
}
