import { useEffect, useMemo } from 'react'
import type { LobbyState, Outcome, RoundResult, ShotReport } from '../game'
import type { Session } from '../session'
import { sfx } from '../sound'
import { Avatar, Bubble, Button } from '../ui'

const BANNERS: Record<Outcome, { emoji: string; title: string; sub: string; cls: string }> = {
  winner: { emoji: '🏆', title: 'YOU WIN!', sub: 'Fastest hand in the West!', cls: 'win' },
  survivor: { emoji: '😅', title: 'You survived!', sub: 'Phew! Nobody got you.', cls: 'survive' },
  loser: { emoji: '💫', title: 'BONK!', sub: 'You got got, partner.', cls: 'lose' },
  draw: { emoji: '🌵', title: 'Everybody missed!', sub: 'The cactus is very scared though.', cls: 'draw' },
}

export default function Results({ session, lobby, result }: { session: Session; lobby: LobbyState; result: RoundResult }) {
  const mine = result.outcomes[session.pid] as Outcome | undefined
  const banner = mine ? BANNERS[mine] : null
  const byId = useMemo(() => Object.fromEntries(lobby.players.map(p => [p.id, p])), [lobby.players])
  const winners = Object.entries(result.outcomes).filter(([, o]) => o === 'winner').map(([id]) => byId[id]).filter(Boolean)

  useEffect(() => {
    if (mine === 'winner') sfx.win()
    else if (mine === 'loser') sfx.lose()
    else sfx.boing()
  }, [])

  const hitter = result.hitBy[session.pid] ? byId[result.hitBy[session.pid]] : null

  return (
    <>
      {mine === 'winner' && <Confetti />}
      {banner ? (
        <Bubble className={`result-banner ${banner.cls}`}>
          <div className="big-emoji pop-in">{banner.emoji}</div>
          <h1>{banner.title}</h1>
          <p>{hitter ? `${hitter.emoji} ${hitter.name} got you first!` : banner.sub}</p>
        </Bubble>
      ) : (
        <Bubble className="result-banner draw">
          <div className="big-emoji">🍿</div>
          <h1>{winners.length ? `${winners.map(w => w.name).join(' & ')} wins!` : 'No winner!'}</h1>
        </Bubble>
      )}

      <Bubble>
        <h2>What happened</h2>
        <ul className="shots">
          {result.shots.map(s => <ShotLine key={s.shooter} s={s} byId={byId} />)}
        </ul>
      </Bubble>

      <Bubble>
        <h2>Scoreboard</h2>
        <ul className="players compact">
          {[...lobby.players].sort((a, b) => b.wins - a.wins).map(p => (
            <li key={p.id} className={`player ${result.outcomes[p.id] ?? ''}`}>
              <Avatar emoji={p.emoji} size="sm" />
              <span className="pname">{p.name}</span>
              <span className="wins">⭐ {p.wins}</span>
            </li>
          ))}
        </ul>
      </Bubble>

      {session.host ? (
        <Button big color="orange" onClick={session.host.backToLobby}>Back to the start! 🤝</Button>
      ) : (
        <Bubble className="muted center">Walk back to the middle! The host starts the next round.</Bubble>
      )}
    </>
  )
}

function ShotLine({ s, byId }: { s: ShotReport; byId: Record<string, { name: string; emoji: string }> }) {
  const who = byId[s.shooter]
  const target = s.target ? byId[s.target] : null
  const time = s.reaction != null ? <span className="time">{(s.reaction / 1000).toFixed(2)}s</span> : null
  let text: string
  switch (s.reason) {
    case 'hit': text = `hit ${target?.emoji ?? ''} ${target?.name ?? '?'}! 🎯`; break
    case 'miss': text = s.missBy != null ? `missed by ${s.missBy}° 💨` : 'missed 💨'; break
    case 'ground': text = 'shot the dirt! Raise it higher 🪱'; break
    case 'too-late': text = 'was already down 💫'; break
    default: text = 'never shot 🐢'
  }
  return (
    <li className={`shot ${s.reason}`}>
      <span className="avatar avatar-sm">{who?.emoji}</span>
      <span className="shot-text"><b>{who?.name ?? '?'}</b> {text}</span>
      {time}
    </li>
  )
}

function Confetti() {
  const bits = useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 1.5,
    dur: 2.5 + Math.random() * 2,
    emoji: ['⭐', '🎉', '✨', '🌟', '🎊'][i % 5],
  })), [])
  return (
    <div className="confetti" aria-hidden>
      {bits.map((b, i) => (
        <span key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s` }}>{b.emoji}</span>
      ))}
    </div>
  )
}
