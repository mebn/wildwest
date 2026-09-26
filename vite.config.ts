import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { relay } from './relay.ts'

// relay() lets the phones pass game messages through this server.
//
// `npm run dev`: HTTPS with a self-signed certificate (motion sensors need
// HTTPS) on the LAN, so phones can connect straight to this machine.
//
// `npm run preview`: plain HTTP, meant to sit behind a reverse proxy that
// provides HTTPS, e.g. Caddy: `wildwest.mebn.dev { reverse_proxy localhost:4173 }`.
export default defineConfig(({ isPreview }) => ({
  plugins: [react(), ...(isPreview ? [] : [basicSsl()]), relay()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
}))
