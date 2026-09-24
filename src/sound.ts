// Tiny synthesized sound effects + spoken callouts. No audio files needed.

let ctx: AudioContext | null = null

/** Call from a tap so mobile browsers allow audio later. */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  // Prime speech synthesis on iOS with a silent utterance.
  try {
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0
    speechSynthesis.speak(u)
  } catch { /* no speech */ }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, slideTo?: number, delay = 0) {
  if (!ctx) return
  const t = ctx.currentTime + delay
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(g).connect(ctx.destination)
  o.start(t)
  o.stop(t + dur + 0.05)
}

function noise(dur: number, vol = 0.8, lowpass = 3000) {
  if (!ctx) return
  const len = Math.floor(ctx.sampleRate * dur)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = lowpass
  const g = ctx.createGain()
  g.gain.value = vol
  src.connect(f).connect(g).connect(ctx.destination)
  src.start()
}

export function say(text: string, rate = 1.05) {
  try {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = rate
    u.pitch = 1.2
    u.volume = 1
    speechSynthesis.speak(u)
  } catch { /* no speech */ }
}

export const sfx = {
  pop: () => tone(600, 0.12, 'sine', 0.25, 1200),
  step: () => { tone(160, 0.12, 'triangle', 0.5, 70); noise(0.06, 0.3, 900) },
  tick: () => tone(900, 0.08, 'square', 0.12),
  draw: () => { tone(1400, 0.15, 'square', 0.25); tone(1900, 0.35, 'square', 0.25, undefined, 0.15) },
  bang: () => { noise(0.5, 1, 2500); tone(120, 0.25, 'sine', 0.6, 40) },
  click: () => tone(300, 0.05, 'square', 0.2),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.3, undefined, i * 0.12)),
  lose: () => [392, 370, 349, 294].forEach((f, i) => tone(f, i === 3 ? 0.7 : 0.3, 'sawtooth', 0.15, i === 3 ? 200 : undefined, i * 0.3)),
  boing: () => tone(200, 0.5, 'sine', 0.35, 800),
}
