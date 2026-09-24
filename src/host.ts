// The host phone's game brain. Other phones only send inputs and render state.

import {
  type Anchor, type LobbyState, type Settings, type Shot, type ToHost, type ToPlayer,
  resolveRound, SHOT_WINDOW_MS,
} from './game'

export const HOLSTER_MS = 3000
export const STEP_MS = 1000
export const TURN_MS = 1200

export class HostEngine {
  state: LobbyState
  private anchors: Record<string, Anchor> = {}
  private shots: Record<string, Shot | null> = {}
  private roundIds: string[] = []
  private timer: ReturnType<typeof setTimeout> | undefined
  private send: (pid: string, msg: ToPlayer) => void

  constructor(code: string, send: (pid: string, msg: ToPlayer) => void) {
    this.send = send
    this.state = {
      code,
      phase: 'lobby',
      round: 0,
      players: [],
      settings: { steps: 5, tolerance: 20 },
      duelists: [],
      calibrated: [],
    }
  }

  private broadcast(msg: ToPlayer, only?: string[]) {
    for (const p of this.state.players) {
      if (p.connected && (!only || only.includes(p.id))) this.send(p.id, msg)
    }
  }

  private pushLobby() {
    this.state = { ...this.state, players: this.state.players.map(p => ({ ...p })) }
    this.broadcast({ t: 'lobby', state: this.state })
  }

  handle(pid: string, msg: ToHost) {
    const s = this.state
    switch (msg.t) {
      case 'join': {
        const existing = s.players.find(p => p.id === pid)
        if (existing) {
          Object.assign(existing, { name: msg.name, emoji: msg.emoji, connected: true })
        } else {
          s.players.push({ id: pid, name: msg.name, emoji: msg.emoji, ready: false, connected: true, wins: 0 })
        }
        this.pushLobby()
        break
      }
      case 'ready': {
        const p = s.players.find(p => p.id === pid)
        if (p) p.ready = msg.ready
        this.pushLobby()
        break
      }
      case 'anchor': {
        if (s.phase !== 'calibrate' || msg.round !== s.round || !this.roundIds.includes(pid)) return
        this.anchors[pid] = msg.anchor
        if (!s.calibrated.includes(pid)) s.calibrated = [...s.calibrated, pid]
        this.pushLobby()
        if (this.roundIds.every(id => this.anchors[id])) this.go()
        break
      }
      case 'shot': {
        if (s.phase !== 'duel' || msg.round !== s.round || !this.roundIds.includes(pid) || pid in this.shots) return
        this.shots[pid] = msg.shot
        if (this.roundIds.every(id => id in this.shots)) this.resolve()
        break
      }
    }
  }

  setConnected(pid: string, connected: boolean) {
    const p = this.state.players.find(p => p.id === pid)
    if (!p) return
    p.connected = connected
    if (!connected && this.state.phase === 'lobby' && !p.wins) {
      this.state.players = this.state.players.filter(x => x.id !== pid)
    }
    this.pushLobby()
    // A player who drops while calibrating is left out of this round.
    if (!connected && this.state.phase === 'calibrate' && this.roundIds.includes(pid) && !this.anchors[pid]) {
      this.roundIds = this.roundIds.filter(id => id !== pid)
      this.state.duelists = this.roundIds
      if (this.roundIds.length < 2) this.backToLobby()
      else if (this.roundIds.every(id => this.anchors[id])) this.go()
      else this.pushLobby()
      return
    }
    // A player who drops mid-duel simply doesn't shoot.
    if (!connected && this.state.phase === 'duel' && this.roundIds.includes(pid) && !(pid in this.shots)) {
      this.handle(pid, { t: 'shot', round: this.state.round, shot: null })
    }
  }

  canStart() {
    const ready = this.state.players.filter(p => p.connected && p.ready)
    return this.state.phase === 'lobby' && ready.length >= 2 &&
      this.state.players.filter(p => p.connected).every(p => p.ready)
  }

  setSettings(settings: Partial<Settings>) {
    this.state.settings = { ...this.state.settings, ...settings }
    this.pushLobby()
  }

  start() {
    if (!this.canStart()) return
    clearTimeout(this.timer)
    this.roundIds = this.state.players.filter(p => p.connected && p.ready).map(p => p.id)
    this.anchors = {}
    this.shots = {}
    this.state.round++
    this.state.phase = 'calibrate'
    this.state.calibrated = []
    this.state.duelists = this.roundIds
    this.pushLobby()
    this.broadcast({ t: 'calibrate', round: this.state.round }, this.roundIds)
  }

  private go() {
    const s = this.state
    s.phase = 'duel'
    const drawDelay = 1500 + Math.random() * 3000
    this.pushLobby()
    this.broadcast({ t: 'go', round: s.round, steps: s.settings.steps, drawDelay }, this.roundIds)
    const total = HOLSTER_MS + s.settings.steps * STEP_MS + TURN_MS + drawDelay + SHOT_WINDOW_MS + 4000
    this.timer = setTimeout(() => this.resolve(), total)
  }

  private resolve() {
    clearTimeout(this.timer)
    const s = this.state
    if (s.phase !== 'duel') return
    const result = resolveRound(s.round, this.roundIds, this.anchors, this.shots, s.settings.tolerance)
    for (const p of s.players) if (result.outcomes[p.id] === 'winner') p.wins++
    s.phase = 'results'
    this.pushLobby()
    this.broadcast({ t: 'result', result })
  }

  backToLobby() {
    clearTimeout(this.timer)
    this.state.phase = 'lobby'
    this.state.calibrated = []
    this.state.players = this.state.players.filter(p => p.connected || p.wins)
    this.pushLobby()
  }

  dispose() { clearTimeout(this.timer) }
}
