// A tiny message relay built into the Vite dev/preview server.
//
// The phones already load the page from this server over the LAN, so they can
// always reach it, even on Wi-Fi that blocks phone-to-phone traffic. The relay
// holds no game logic: it only forwards messages between the host phone and
// the players in a room.

import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Plugin } from 'vite'
import { WebSocket, WebSocketServer } from 'ws'

const PATH = '/ww-relay'
const HOST_GRACE_MS = 60_000

interface Room {
  host: WebSocket | null
  players: Map<string, WebSocket>
  expire?: ReturnType<typeof setTimeout>
}

export function relay(): Plugin {
  const rooms = new Map<string, Room>()
  const wss = new WebSocketServer({ noServer: true })
  const alive = new WeakMap<WebSocket, boolean>()
  let nextId = 1

  // Drop sockets that stop answering (phones that walked out of Wi-Fi range).
  setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) { ws.terminate(); continue }
      alive.set(ws, false)
      ws.ping()
    }
  }, 10_000).unref()

  const send = (ws: WebSocket | null | undefined, obj: unknown) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
  }
  const parse = (data: unknown) => {
    try { return JSON.parse(String(data)) } catch { return null }
  }

  function onConnect(ws: WebSocket, url: URL) {
    alive.set(ws, true)
    ws.on('pong', () => alive.set(ws, true))
    const code = url.searchParams.get('room')?.toUpperCase()
    if (!code) { ws.close(); return }
    let room = rooms.get(code)

    if (url.searchParams.get('role') === 'host') {
      const resume = url.searchParams.get('resume') === '1'
      if (room && (room.host?.readyState === WebSocket.OPEN || !resume)) {
        send(ws, { t: 'error', type: 'unavailable-id' })
        ws.close()
        return
      }
      if (!room) { room = { host: null, players: new Map() }; rooms.set(code, room) }
      const r = room
      clearTimeout(r.expire)
      r.host = ws
      send(ws, { t: 'open' })
      ws.on('message', data => {
        const m = parse(data)
        if (m) send(r.players.get(m.to), { t: 'data', msg: m.msg })
      })
      ws.on('close', closeCode => {
        if (r.host !== ws) return
        r.host = null
        // 4000 = the host tapped Exit, so end the game for everyone now.
        if (closeCode === 4000) {
          r.players.forEach(p => { send(p, { t: 'error', type: 'host-left' }); p.close() })
          rooms.delete(code)
          return
        }
        // Give the host phone a minute to come back before closing the room.
        r.expire = setTimeout(() => {
          r.players.forEach(p => p.close())
          rooms.delete(code)
        }, HOST_GRACE_MS)
      })
      return
    }

    if (!room) {
      send(ws, { t: 'error', type: 'peer-unavailable' })
      ws.close()
      return
    }
    const r = room
    const id = `c${nextId++}`
    r.players.set(id, ws)
    send(ws, { t: 'open' })
    ws.on('message', data => {
      const msg = parse(data)
      if (msg) send(r.host, { t: 'data', from: id, msg })
    })
    ws.on('close', () => {
      r.players.delete(id)
      send(r.host, { t: 'leave', from: id })
    })
  }

  const attach = (http: Server | null | undefined) => {
    http?.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(req.url ?? '/', 'http://relay')
      if (url.pathname !== PATH) return // leave Vite's own HMR socket alone
      wss.handleUpgrade(req, socket, head, ws => onConnect(ws, url))
    })
  }

  return {
    name: 'wild-west-relay',
    configureServer(server) {
      attach(server.httpServer as Server | null)
      server.middlewares.use(`${PATH}/ping`, (_req, res) => res.end('ww-ok'))
    },
    configurePreviewServer(server) {
      attach(server.httpServer as Server)
      server.middlewares.use(`${PATH}/ping`, (_req, res) => res.end('ww-ok'))
    },
  }
}
