import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { LobbyState } from '../game'
import { keepAwake, needsPermission, sensorsLive, sensorsStarted, SIM, startSensors } from '../motion'
import type { Session } from '../session'
import { unlockAudio } from '../sound'
import { Avatar, Bubble, Button, Chips } from '../ui'

export default function Lobby({ session, lobby }: { session: Session; lobby: LobbyState }) {
  const me = lobby.players.find(p => p.id === session.pid)
  const [sensorProblem, setSensorProblem] = useState<string | null>(null)
  const joinUrl = `${location.origin}${location.pathname}?room=${lobby.code}`
  const host = session.host
  const connected = lobby.players.filter(p => p.connected)

  const getReady = async () => {
    unlockAudio()
    const ok = await startSensors()
    if (!ok) {
      setSensorProblem('We need the motion sensors to aim! Allow "Motion & Orientation" and try again.')
      return
    }
    keepAwake()
    session.send({ t: 'ready', ready: true })
  }

  // After a page reload the host still thinks we're ready, but sensors need a new tap.
  useEffect(() => {
    if (me?.ready && !sensorsStarted()) session.send({ t: 'ready', ready: false })
  }, [me?.ready])

  // Warn if the sensors never send anything (e.g. a laptop, or plain http).
  useEffect(() => {
    if (!me?.ready || SIM) return
    const t = setTimeout(() => {
      if (!sensorsLive()) {
        setSensorProblem(
          location.protocol !== 'https:'
            ? 'Motion sensors only work over https:// 🔒'
            : 'No motion sensors found on this device. Try a phone! (or add ?sim to the URL to test)',
        )
      }
    }, 2000)
    return () => clearTimeout(t)
  }, [me?.ready])

  return (
    <>
      <Bubble className="code-card">
        <div className="label">Game code</div>
        <div className="code">{lobby.code}</div>
        {host && (
          <div className="qr">
            <QRCodeSVG value={joinUrl} size={150} bgColor="transparent" fgColor="#5a2d0c" />
            <div className="muted small">Scan to join!</div>
          </div>
        )}
      </Bubble>

      <Bubble>
        <h2>Cowpokes ({connected.length})</h2>
        <ul className="players">
          {lobby.players.map(p => (
            <li key={p.id} className={`player ${p.connected ? '' : 'offline'} ${p.id === session.pid ? 'me' : ''}`}>
              <Avatar emoji={p.emoji} />
              <span className="pname">{p.name}{p.id === session.pid && <em> (you)</em>}</span>
              {p.wins > 0 && <span className="wins">{'⭐'.repeat(Math.min(p.wins, 5))}{p.wins > 5 ? `×${p.wins}` : ''}</span>}
              <span className={`ready-dot ${p.ready ? 'yes' : ''}`}>{!p.connected ? '💤' : p.ready ? '✅' : '⏳'}</span>
            </li>
          ))}
        </ul>
        {connected.length < 2 && <p className="muted center">Waiting for a rival to join…</p>}
      </Bubble>

      {!me?.ready ? (
        <Button big color="green" onClick={getReady}>
          I'm ready! 🤠 {needsPermission() && <small className="btn-sub">(allows motion sensors)</small>}
        </Button>
      ) : (
        <Bubble className="ready-card">✅ You're ready, partner!</Bubble>
      )}
      {sensorProblem && <Bubble className="warn">⚠️ {sensorProblem}</Bubble>}

      {host ? (
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
            {host.canStart ? 'Everyone back to back? START! 🔫' : 'Waiting for everyone to be ready…'}
          </Button>
        </Bubble>
      ) : (
        <Bubble className="muted center">The host starts the duel when everyone is back to back 🤝</Bubble>
      )}

      <HowTo steps={lobby.settings.steps} many={connected.length > 2} />
    </>
  )
}

function HowTo({ steps, many }: { steps: number; many: boolean }) {
  return (
    <Bubble className="howto">
      <h2>How to duel</h2>
      <ol>
        <li><b>🤝 Back to back.</b> Everyone stands together, facing <i>away</i> from each other.</li>
        <li><b>📱 Point your phone forward</b>, screen up, like a laser pointer. It locks your direction.</li>
        <li><b>👖 Phone in pocket!</b> Walk <b>{steps} steps</b> when the phone counts.</li>
        <li><b>🔄 Turn around</b> and wait for it…</li>
        <li><b>💥 DRAW!</b> Whip out your phone, aim the <b>top edge</b> at your rival and <b>tap</b> (or flick it up) to shoot!</li>
      </ol>
      {many && <p className="muted small">With 3+ players, stand in a circle in the same order as the list (clockwise).</p>}
      <p className="muted small">Keep phones away from big metal things so the compass stays happy 🧲</p>
    </Bubble>
  )
}
