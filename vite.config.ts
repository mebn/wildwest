import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { relay } from './relay.ts'

// HTTPS is required for motion sensors on phones, and `host: true`
// exposes the dev server on the LAN so phones can connect to it.
// relay() lets the phones pass game messages through this server.
export default defineConfig({
  plugins: [react(), basicSsl(), relay()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
})
