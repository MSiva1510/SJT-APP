import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const DEFAULT_ALLOWED_GPS_HOSTS = ['mvt.apmkingstrack.com']

function gpsProxyDevMiddleware() {
  return {
    name: 'gps-proxy-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname
        if (pathname !== '/api/gps-proxy') {
          next()
          return
        }

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.end()
          return
        }

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        try {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
          const { target_url, vendor_method, ...vendorPayload } = payload
          const target = new URL(target_url)
          const allowedHosts = (process.env.GPS_PROXY_ALLOWED_HOSTS || DEFAULT_ALLOWED_GPS_HOSTS.join(','))
            .split(',')
            .map(host => host.trim().toLowerCase())
            .filter(Boolean)

          if (!['http:', 'https:'].includes(target.protocol) || !allowedHosts.includes(target.hostname.toLowerCase())) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'GPS target URL is not allowed' }))
            return
          }

          const method = String(vendor_method || 'POST').toUpperCase()
          if (method === 'GET') {
            for (const [key, value] of Object.entries(vendorPayload)) {
              if (value == null || value === '') continue
              target.searchParams.set(key, value)
            }
          }

          const upstream = await fetch(target, {
            method,
            headers: {
              'Content-Type': method === 'GET' ? 'application/json' : 'application/x-www-form-urlencoded'
            },
            body: method === 'GET' ? undefined : new URLSearchParams(vendorPayload).toString(),
          })
          const text = await upstream.text()
          res.statusCode = upstream.status
          res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
          res.end(text)
        } catch (error) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error?.message || 'GPS proxy request failed' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), gpsProxyDevMiddleware()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('xlsx')) return 'xlsx'
          if (id.includes('leaflet')) return 'leaflet'
          if (id.includes('@supabase')) return 'supabase'
          if (
            id.includes('react') ||
            id.includes('react-dom') ||
            id.includes('react-router-dom')
          ) return 'react-vendor'
          if (id.includes('lucide-react')) return 'icons'
          return 'vendor'
        },
      },
    },
  },
})
