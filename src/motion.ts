// Phone motion sensors: where the "barrel" (top edge of the phone) points.
//
// DeviceOrientation gives alpha/beta/gamma as the rotation Z(alpha)·X(beta)·Y(gamma)
// from the earth frame (x = east, y = north, z = up). The device's top edge is
// its +y axis, which in earth coordinates is (-sin a·cos b, cos a·cos b, sin b).
// From that we get a clockwise compass-style heading and an elevation.

import { useEffect, useState } from 'react'

export interface Pose {
  heading: number // degrees clockwise, in this phone's sensor frame
  elevation: number // degrees, 0 = barrel level, +90 = pointing at the sky
  compass: number | null // true compass heading when known
  t: number
}

type Listener = (p: Pose) => void

const RAD = Math.PI / 180
export const SIM = new URLSearchParams(location.search).has('sim')

let current: Pose = { heading: 0, elevation: 0, compass: null, t: 0 }
let started = false
let hasData = false
const history: Pose[] = []
const listeners = new Set<Listener>()
const kickListeners = new Set<(p: Pose) => void>()

function emit(p: Pose) {
  current = p
  hasData = true
  history.push(p)
  while (history.length && p.t - history[0].t > 1500) history.shift()
  listeners.forEach(l => l(p))
}

function fromEuler(alpha: number, beta: number, compassHint: number | null, absolute: boolean): Pose {
  const a = alpha * RAD
  const b = beta * RAD
  const east = -Math.sin(a) * Math.cos(b)
  const north = Math.cos(a) * Math.cos(b)
  const heading = ((Math.atan2(east, north) / RAD) + 360) % 360
  const elevation = Math.asin(Math.max(-1, Math.min(1, Math.sin(b)))) / RAD
  return {
    heading,
    elevation,
    compass: compassHint ?? (absolute ? heading : null),
    t: performance.now(),
  }
}

function onOrientation(e: DeviceOrientationEvent) {
  if (e.alpha == null || e.beta == null) return
  const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
  emit(fromEuler(e.alpha, e.beta, typeof ios === 'number' && ios >= 0 ? ios : null, !!e.absolute))
  // Flick detection from orientation too: the barrel tipping up quickly.
  const before = poseAgo(KICK_WINDOW_MS)
  if (current.elevation - before.elevation > KICK_TILT_DEG) kick()
}

// Recoil flick tuning. Lower numbers = gentler flick needed.
const KICK_RATE = 150 // deg/s upward rotation from the gyroscope
const KICK_TILT_DEG = 10 // or: barrel tipped up this much...
const KICK_WINDOW_MS = 100 // ...within this long
const KICK_AIM_MS = 150 // aim is taken from this long before the flick
const KICK_FROM_LEVEL = 35 // only while the phone was already raised to gun height

function kick() {
  const aim = poseAgo(KICK_AIM_MS)
  // Pulling the phone out of the pocket also tips it up; only a flick that
  // starts from gun height counts as a shot.
  if (Math.abs(aim.elevation) > KICK_FROM_LEVEL) return
  kickListeners.forEach(l => l(aim))
}

function onMotion(e: DeviceMotionEvent) {
  const r = e.rotationRate
  // A sharp upward flick of the barrel = recoil = BANG.
  if (r && r.beta != null && r.beta > KICK_RATE) kick()
}

/** The pose from roughly `ms` ago, so a recoil flick doesn't ruin the aim. */
export function poseAgo(ms: number): Pose {
  const target = performance.now() - ms
  for (let i = history.length - 1; i >= 0; i--) if (history[i].t <= target) return history[i]
  return history[0] ?? current
}

export function getPose() { return current }
export function sensorsLive() { return hasData }
export function sensorsStarted() { return started }

export function needsPermission() {
  const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
  return typeof DOE?.requestPermission === 'function'
}

/** Must be called from a tap (iOS asks the user for permission). */
export async function startSensors(): Promise<boolean> {
  if (started) return true
  if (SIM) { started = true; emit({ ...current, compass: current.heading, t: performance.now() }); return true }
  try {
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
    const DME = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }
    if (typeof DOE?.requestPermission === 'function') {
      if ((await DOE.requestPermission()) !== 'granted') return false
    }
    if (typeof DME?.requestPermission === 'function') {
      await DME.requestPermission().catch(() => 'denied')
    }
  } catch {
    return false
  }
  // Android Chrome gives true compass-based alpha on this event.
  const absolute = 'ondeviceorientationabsolute' in (window as object)
  window.addEventListener(absolute ? 'deviceorientationabsolute' : 'deviceorientation', onOrientation)
  window.addEventListener('devicemotion', onMotion)
  started = true
  return true
}

export function onKick(cb: (p: Pose) => void) {
  kickListeners.add(cb)
  return () => { kickListeners.delete(cb) }
}

/** Average heading/elevation over the last `ms` (circular mean for heading). */
export function averagePose(ms: number): Pose {
  const now = performance.now()
  const recent = history.filter(p => now - p.t <= ms)
  if (!recent.length) return current
  let s = 0, c = 0, cs = 0, cc = 0, el = 0, nCompass = 0
  for (const p of recent) {
    s += Math.sin(p.heading * RAD); c += Math.cos(p.heading * RAD); el += p.elevation
    if (p.compass != null) { cs += Math.sin(p.compass * RAD); cc += Math.cos(p.compass * RAD); nCompass++ }
  }
  const deg = (y: number, x: number) => ((Math.atan2(y, x) / RAD) + 360) % 360
  return {
    heading: deg(s, c),
    elevation: el / recent.length,
    compass: nCompass ? deg(cs, cc) : null,
    t: now,
  }
}

/** React hook: current pose, refreshed ~15 times a second for the UI. */
export function usePose(): Pose {
  const [pose, setPose] = useState(current)
  useEffect(() => {
    let last = 0
    const l: Listener = p => {
      if (p.t - last > 66) { last = p.t; setPose(p) }
    }
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return pose
}

/** Desktop testing: ?sim in the URL gives on-screen sliders instead of sensors. */
export function simSet(heading: number, elevation: number) {
  emit({ heading, elevation, compass: heading, t: performance.now() })
}
export function simKick() {
  kickListeners.forEach(l => l(current))
}

// ---- Screen wake lock, so the phone doesn't sleep in the pocket ----
type WakeLock = EventTarget & { release: () => Promise<void> }
let wakeLock: WakeLock | null = null
export async function keepAwake() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } }
    if (nav.wakeLock && !wakeLock) {
      const lock = await nav.wakeLock.request('screen')
      wakeLock = lock
      lock.addEventListener('release', () => { wakeLock = null })
    }
  } catch { /* not supported, no big deal */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && started) keepAwake()
})

export function buzz(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern) } catch { /* iOS has no vibrate */ }
}
