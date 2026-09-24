// Connects this device to a game: as the host (runs HostEngine locally, either
// playing on a phone or as a big screen that only watches), or as a player.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LobbyState, RoundResult, Settings, ToHost, ToPlayer } from './game'
import { HostEngine, type LiveView } from './host'
import { makeCode, openClient, openHost, type ClientLink, type HostLink } from './net'

export type Status = 'connecting' | 'online' | 'lost' | 'error'
export type RoundCue = Extract<ToPlayer, { t: 'calibrate' } | { t: 'go' }>

function myPid() {
  const key = 'wwduel-pid'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = Math.random().toString(36).slice(2, 10)
    sessionStorage.setItem(key, id)
  }
  return id
}

export interface Session {
  role: 'host' | 'client'
  /** Big-screen host: runs the game but doesn't play. */
  spectator: boolean
  pid: string
  status: Status
  error: string | null
  lobby: LobbyState | null
  cue: RoundCue | null
  result: RoundResult | null
  send: (msg: ToHost) => void
  host?: {
    start: () => void
    canStart: boolean
    setSettings: (s: Partial<Settings>) => void
    backToLobby: () => void
    live: () => LiveView
  }
  leave: () => void
}

export interface JoinRequest {
  role: 'host' | 'client'
  code?: string
  name: string
  emoji: string
  spectate?: boolean
}

export function useSession(req: JoinRequest | null, onLeave: () => void): Session | null {
  const pid = useRef(myPid()).current
  const [status, setStatus] = useState<Status>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [lobby, setLobby] = useState<LobbyState | null>(null)
  const [cue, setCue] = useState<RoundCue | null>(null)
  const [result, setResult] = useState<RoundResult | null>(null)
  const engineRef = useRef<HostEngine | null>(null)
  const sendRef = useRef<(msg: ToHost) => void>(() => {})
  const send = useCallback((msg: ToHost) => sendRef.current(msg), [])

  const deliver = useCallback((msg: ToPlayer) => {
    if (msg.t === 'lobby') setLobby(msg.state)
    else if (msg.t === 'result') setResult(msg.result)
    else setCue(msg)
  }, [])

  useEffect(() => {
    if (!req) return
    setStatus('connecting'); setError(null); setLobby(null); setCue(null); setResult(null)
    const join: ToHost = { t: 'join', pid, name: req.name, emoji: req.emoji }
    let disposed = false

    if (req.role === 'host') {
      let link: HostLink | null = null
      const connToPid = new Map<string, string>()
      const pidToConn = new Map<string, string>()
      const tryCode = (code: string) => {
        const engine = new HostEngine(code, (to, msg) => {
          if (to === pid) deliver(msg)
          else { const c = pidToConn.get(to); if (c) link?.send(c, msg) }
        }, req.spectate ? deliver : undefined)
        engineRef.current = engine
        link = openHost(code, {
          open: () => {
            if (disposed) return
            setStatus('online')
            if (req.spectate) deliver({ t: 'lobby', state: engine.state })
            else engine.handle(pid, join)
          },
          data: (connId, msg) => {
            if (msg.t === 'join') {
              const old = pidToConn.get(msg.pid)
              if (old) connToPid.delete(old)
              connToPid.set(connId, msg.pid)
              pidToConn.set(msg.pid, connId)
            }
            const from = connToPid.get(connId)
            if (from) engine.handle(from, msg)
          },
          leave: connId => {
            const from = connToPid.get(connId)
            connToPid.delete(connId)
            if (from && pidToConn.get(from) === connId) {
              pidToConn.delete(from)
              engine.setConnected(from, false)
            }
          },
          error: (err, type) => {
            if (type === 'unavailable-id') { link?.close(); tryCode(makeCode()); return }
            if (type === 'peer-unavailable' || type === 'webrtc') return
            setError(err)
            if (type === 'network' || type === 'server-error' || type === 'socket-error') setStatus('error')
          },
        })
      }
      tryCode(makeCode())
      sendRef.current = msg => engineRef.current?.handle(pid, msg)
      return () => { disposed = true; engineRef.current?.dispose(); link?.close() }
    }

    // Player: connect to the host, and keep retrying if the link drops.
    let link: ClientLink | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    const connect = () => {
      link?.close()
      link = openClient(req.code!, {
        open: () => { if (!disposed) { setStatus('online'); setError(null); link!.send(join) } },
        data: deliver,
        close: () => { if (!disposed) { setStatus('lost'); retry = setTimeout(connect, 1500) } },
        error: (err, type) => {
          if (disposed) return
          if (type === 'host-left') {
            setError('The host ended the game 👋')
            setStatus('error')
            return
          }
          if (type === 'peer-unavailable') {
            setError(`No game with code ${req.code} 🤔`)
            setStatus('error')
            return
          }
          setError(err)
          setStatus('lost')
          clearTimeout(retry)
          retry = setTimeout(connect, 2000)
        },
      })
      sendRef.current = msg => link?.send(msg)
    }
    connect()
    return () => { disposed = true; clearTimeout(retry); link?.close() }
  }, [req, pid, deliver])

  if (!req) return null
  const engine = engineRef.current
  return {
    role: req.role,
    spectator: req.role === 'host' && !!req.spectate,
    pid,
    status,
    error,
    lobby,
    cue,
    result,
    send,
    host: req.role === 'host' && engine ? {
      start: () => engine.start(),
      canStart: engine.canStart(),
      setSettings: s => engine.setSettings(s),
      backToLobby: () => engine.backToLobby(),
      live: () => engine.live(),
    } : undefined,
    leave: onLeave,
  }
}
