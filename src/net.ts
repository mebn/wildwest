// Networking between phones. The host phone keeps the game state; the other
// phones only send inputs to it. Two ways to carry the messages:
//
// 1. Relay (preferred): the Vite dev/preview server that served the page
//    forwards messages over a WebSocket (see relay.ts). Works on any Wi-Fi,
//    no internet needed.
// 2. PeerJS/WebRTC (fallback, e.g. when hosted as a static site): phones talk
//    directly, using PeerJS's public broker to find each other.

import Peer, { type DataConnection } from 'peerjs'
import type { ToHost, ToPlayer } from './game'

const PREFIX = 'wwduel-v1-'
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const RELAY = '/ww-relay'
const CONNECT_TIMEOUT_MS = 15000

export function makeCode() {
  return Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('')
}

let relayCheck: Promise<boolean> | null = null
function hasRelay() {
  relayCheck ??= (async () => {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 2500)
      const res = await fetch(`${RELAY}/ping`, { signal: ctrl.signal, cache: 'no-store' })
      clearTimeout(t)
      return (await res.text()) === 'ww-ok'
    } catch {
      return false
    }
  })()
  return relayCheck
}

function relaySocket(params: Record<string, string>) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return new WebSocket(`${proto}://${location.host}${RELAY}?${new URLSearchParams(params)}`)
}

export interface HostEvents {
  open: () => void
  data: (connId: string, msg: ToHost) => void
  leave: (connId: string) => void
  error: (err: string, type?: string) => void
}

export interface HostLink {
  send: (connId: string, msg: ToPlayer) => void
  close: () => void
}

export interface ClientEvents {
  open: () => void
  data: (msg: ToPlayer) => void
  close: () => void
  error: (err: string, type?: string) => void
}

export interface ClientLink {
  send: (msg: ToHost) => void
  close: () => void
}

/** Picks the relay if the server has one, otherwise PeerJS. */
export function openHost(code: string, on: HostEvents): HostLink {
  let inner: HostLink | null = null
  let closed = false
  hasRelay().then(relay => {
    if (closed) return
    inner = relay ? relayHost(code, on) : peerHost(code, on)
  })
  return {
    send: (id, msg) => inner?.send(id, msg),
    close: () => { closed = true; inner?.close() },
  }
}

export function openClient(code: string, on: ClientEvents): ClientLink {
  let inner: ClientLink | null = null
  let closed = false
  hasRelay().then(relay => {
    if (closed) return
    inner = relay ? relayClient(code, on) : peerClient(code, on)
  })
  return {
    send: msg => inner?.send(msg),
    close: () => { closed = true; inner?.close() },
  }
}

// ---------- Relay transport ----------

function relayHost(code: string, on: HostEvents): HostLink {
  let ws: WebSocket
  let closed = false
  let everOpened = false
  const connect = () => {
    ws = relaySocket({ room: code, role: 'host', ...(everOpened ? { resume: '1' } : {}) })
    ws.onmessage = e => {
      const m = JSON.parse(e.data)
      if (m.t === 'open') { everOpened = true; on.open() }
      else if (m.t === 'data') on.data(m.from, m.msg)
      else if (m.t === 'leave') on.leave(m.from)
      else if (m.t === 'error') { closed = true; on.error(m.type, m.type) }
    }
    // The host's socket can drop (screen lock, Wi-Fi blip). The server keeps
    // the room, so just reconnect and carry on.
    ws.onclose = () => { if (!closed) setTimeout(connect, 1000) }
  }
  connect()
  return {
    send: (to, msg) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ to, msg })) },
    // 4000 tells the relay the host left on purpose, so the room closes now.
    close: () => { closed = true; ws.close(4000, 'host-left') },
  }
}

function relayClient(code: string, on: ClientEvents): ClientLink {
  let closed = false
  let failed = false
  const ws = relaySocket({ room: code, role: 'player' })
  const timeout = setTimeout(() => {
    if (ws.readyState !== WebSocket.OPEN) { failed = true; ws.close(); on.error('Could not reach the game server', 'timeout') }
  }, CONNECT_TIMEOUT_MS)
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.t === 'open') { clearTimeout(timeout); on.open() }
    else if (m.t === 'data') on.data(m.msg)
    else if (m.t === 'error') { failed = true; on.error(m.type, m.type) }
  }
  ws.onclose = () => { clearTimeout(timeout); if (!closed && !failed) on.close() }
  return {
    send: msg => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)) },
    close: () => { closed = true; clearTimeout(timeout); ws.close() },
  }
}

// ---------- PeerJS transport ----------

function peerHost(code: string, on: HostEvents): HostLink {
  const peer = new Peer(PREFIX + code)
  const conns = new Map<string, DataConnection>()
  const timeout = setTimeout(() => {
    if (!peer.open) on.error('Could not reach the PeerJS matchmaking server. Is this phone online?', 'network')
  }, CONNECT_TIMEOUT_MS)
  peer.on('open', () => { clearTimeout(timeout); on.open() })
  peer.on('connection', conn => {
    conn.on('open', () => conns.set(conn.connectionId, conn))
    conn.on('data', d => on.data(conn.connectionId, d as ToHost))
    const gone = () => {
      if (conns.delete(conn.connectionId)) on.leave(conn.connectionId)
    }
    conn.on('close', gone)
    conn.on('error', gone)
  })
  peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect() })
  peer.on('error', e => on.error(e.message, e.type))
  return {
    send: (id, msg) => { const c = conns.get(id); if (c?.open) c.send(msg) },
    close: () => { clearTimeout(timeout); peer.destroy() },
  }
}

function peerClient(code: string, on: ClientEvents): ClientLink {
  const peer = new Peer()
  let conn: DataConnection | null = null
  let closed = false
  const timeout = setTimeout(() => {
    if (!conn?.open) {
      on.error(
        peer.open
          ? 'Found the game but the phones cannot talk directly. The Wi-Fi may block it. Try running the dev server instead.'
          : 'Could not reach the PeerJS matchmaking server. Is this phone online?',
        'timeout',
      )
    }
  }, CONNECT_TIMEOUT_MS)
  peer.on('open', () => {
    conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' })
    conn.on('open', () => { clearTimeout(timeout); on.open() })
    conn.on('data', d => on.data(d as ToPlayer))
    conn.on('close', () => { if (!closed) on.close() })
    conn.on('error', e => on.error(e.message))
  })
  peer.on('error', e => on.error(e.message, e.type))
  return {
    send: msg => { if (conn?.open) conn.send(msg) },
    close: () => { closed = true; clearTimeout(timeout); peer.destroy() },
  }
}
