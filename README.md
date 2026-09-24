# 🤠 Wild West Duel

A phone-vs-phone quick-draw game. Players stand back to back, walk a few steps,
turn around and draw their phones. Motion sensors work out who aimed at whom,
and who was fastest.

## Run it

```sh
npm install
npm run dev
```

Vite prints a `Network:` address like `https://192.168.1.20:5173`. Open it on
every phone (same Wi-Fi) and accept the self-signed certificate warning.
HTTPS is required for motion sensors.

### Behind Caddy (or another HTTPS reverse proxy)

```sh
npm run build
npm run preview        # plain HTTP on port 4173, includes the relay
```

```caddyfile
wildwest.mebn.dev {
	reverse_proxy localhost:4173
}
```

Caddy provides the HTTPS certificate. To use a different domain, add it to
`preview.allowedHosts` in `vite.config.ts`.

---

### Big screen mode 📺

Open the game on a laptop or TV and tap **Host on a big screen**. That screen
runs the duel (code, QR, rules, START) but doesn't play. While it hosts, every
phone streams its direction and tilt to it about 10 times a second, so it shows:

- live dials for each phone's direction and tilt, and whether it's holstered or raised
- the walk countdown and DRAW!, with sound
- a top-down arena with each player's aim arrow and hit cone (green = on target)
- who fired and how fast, then the hit and miss lines, the winner and a scoreboard

---

One phone taps **Start a new game** and shows a code + QR. Others scan or type the code.

## How it works

- **No game server.** The host phone runs the game logic (`src/host.ts`). The
  Vite dev/preview server that serves the page just forwards messages between
  the phones over a WebSocket (`relay.ts`), so it works on any Wi-Fi and needs
  no internet. If the page is hosted as a plain static site (no relay), it
  falls back to direct WebRTC via PeerJS, which needs internet and a network
  that allows phone-to-phone traffic.
- **Calibration:** while back to back, each phone is held level pointing forward
  and records its heading.
- **Walk:** the phone counts steps out loud from a shared, random timeline.
- **Draw:** tap the screen (or flick the phone up like recoil) to shoot. The phone
  sends how far it turned since calibration, its tilt and its reaction time.
- **Hit detection** (`src/game.ts`): everyone ends up on a circle around the start
  point. Two players are always opposite, so no compass is needed. With 3+ players
  real compass headings are used when every phone has one, otherwise they're
  assumed spread evenly in lobby order. A shot hits the nearest living rival
  within the aim tolerance. The fastest hit wins.

## Testing on a laptop

Add `?sim` to the URL for on-screen heading/tilt sliders instead of sensors.
Open two tabs to play against yourself.
