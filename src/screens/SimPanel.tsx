import { useEffect, useState } from 'react'
import { simKick, simSet } from '../motion'

/** Desktop testing stand-in for the phone's motion sensors (open with ?sim). */
export default function SimPanel() {
  const [heading, setHeading] = useState(0)
  const [elevation, setElevation] = useState(0)
  useEffect(() => { simSet(heading, elevation) }, [heading, elevation])
  // Keep emitting so "hold still" timers see fresh data.
  useEffect(() => {
    const id = setInterval(() => simSet(heading, elevation), 100)
    return () => clearInterval(id)
  }, [heading, elevation])

  return (
    <div className="sim">
      <b>🧪 Sim</b>
      <label>Heading {heading}°
        <input type="range" min={0} max={359} value={heading} onChange={e => setHeading(+e.target.value)} />
      </label>
      <label>Tilt {elevation}°
        <input type="range" min={-90} max={90} value={elevation} onChange={e => setElevation(+e.target.value)} />
      </label>
      <button onClick={() => setHeading(h => (h + 180) % 360)}>Turn 180°</button>
      <button onClick={simKick}>Flick 💥</button>
    </div>
  )
}
