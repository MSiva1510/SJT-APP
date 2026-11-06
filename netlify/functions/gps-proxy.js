const DEFAULT_ALLOWED_HOSTS = ['mvt.apmkingstrack.com']

function parseAllowedHosts() {
  const configured = process.env.GPS_PROXY_ALLOWED_HOSTS
  if (!configured) return DEFAULT_ALLOWED_HOSTS
  return configured.split(',').map(host => host.trim().toLowerCase()).filter(Boolean)
}

function isAllowedTarget(targetUrl) {
  try {
    const url = new URL(targetUrl)
    if (!['http:', 'https:'].includes(url.protocol)) return false
    return parseAllowedHosts().includes(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const { target_url, vendor_method, ...vendorPayload } = payload
  if (!target_url || !isAllowedTarget(target_url)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'GPS target URL is not allowed' }) }
  }

  try {
    const method = String(vendor_method || 'POST').toUpperCase()
    const url = new URL(target_url)
    if (method === 'GET') {
      for (const [key, value] of Object.entries(vendorPayload)) {
        if (value == null || value === '') continue
        url.searchParams.set(key, value)
      }
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': method === 'GET' ? 'application/json' : 'application/x-www-form-urlencoded'
      },
      body: method === 'GET' ? undefined : new URLSearchParams(vendorPayload).toString(),
    })

    const text = await response.text()
    return {
      statusCode: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
      body: text,
    }
  } catch (error) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: error?.message || 'GPS proxy request failed' }),
    }
  }
}
