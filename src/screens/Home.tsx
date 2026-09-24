import { useState } from 'react'
import type { JoinRequest } from '../session'
import { sfx, unlockAudio } from '../sound'
import { Bubble, Button } from '../ui'

export const EMOJIS = ['🤠', '🐴', '🦊', '🐸', '🐷', '🐻', '🦄', '🐙', '🐔', '🐮', '🦝', '🐯']

const readRoomParam = () => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? ''

/** Forget the invite code in the URL, e.g. after leaving that room. */
export function clearRoomParam() {
  const url = new URL(location.href)
  if (!url.searchParams.has('room')) return
  url.searchParams.delete('room')
  history.replaceState(null, '', url)
}

export default function Home({ onJoin }: { onJoin: (r: JoinRequest) => void }) {
  const [name, setName] = useState(() => localStorage.getItem('wwduel-name') ?? '')
  const [emoji, setEmoji] = useState(() => localStorage.getItem('wwduel-emoji') ?? EMOJIS[Math.floor(Math.random() * EMOJIS.length)])
  const [roomParam, setRoomParam] = useState(readRoomParam)
  const [code, setCode] = useState(roomParam)
  const cleanName = name.trim().slice(0, 14)

  const go = (role: 'host' | 'client', spectate = false) => {
    unlockAudio()
    localStorage.setItem('wwduel-name', cleanName)
    localStorage.setItem('wwduel-emoji', emoji)
    onJoin({ role, code: role === 'client' ? code : undefined, name: cleanName || 'Stranger', emoji, spectate })
  }

  const exitInvite = () => {
    sfx.pop()
    clearRoomParam()
    setRoomParam('')
    setCode('')
  }

  return (
    <>
      {roomParam && <button className="exit-btn" aria-label="Exit room" onClick={exitInvite}>🚪 Exit</button>}
      <header className="title">
        <div className="title-hat bounce">🤠</div>
        <h1>
          <span>Wild West</span>
          <span className="title-duel">DUEL!</span>
        </h1>
        <p className="tagline">Back to back. Five steps. Turn. <b>DRAW!</b></p>
      </header>

      <Bubble>
        <label className="label" htmlFor="name">What's your cowpoke name?</label>
        <input
          id="name"
          className="input"
          placeholder="Sheriff Sparkles"
          value={name}
          maxLength={14}
          onChange={e => setName(e.target.value)}
        />
        <div className="label">Pick your buddy</div>
        <div className="emoji-grid">
          {EMOJIS.map(e => (
            <button key={e} className={`emoji-pick ${e === emoji ? 'on' : ''}`} onClick={() => setEmoji(e)}>{e}</button>
          ))}
        </div>
      </Bubble>

      {roomParam ? (
        <Bubble className="join-card">
          <p>You're invited to game <b className="code-inline">{roomParam}</b>!</p>
          <Button big color="green" onClick={() => go('client')}>Join the duel 🎉</Button>
        </Bubble>
      ) : (
        <>
          <Button big color="orange" onClick={() => go('host')}>Start a new game ⭐</Button>
          <Button color="blue" onClick={() => go('host', true)}>
            📺 Host on a big screen
            <small className="btn-sub">This screen runs the duel and shows everything live. Players use phones.</small>
          </Button>
          <div className="or">or join a friend</div>
          <Bubble className="join-card row">
            <input
              className="input code-input"
              placeholder="CODE"
              value={code}
              maxLength={4}
              autoCapitalize="characters"
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            />
            <Button color="green" disabled={code.length !== 4} onClick={() => go('client')}>Join!</Button>
          </Bubble>
        </>
      )}
    </>
  )
}
