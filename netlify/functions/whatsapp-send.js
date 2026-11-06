import { createClient } from '@supabase/supabase-js'

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function respond(statusCode, body) {
  return { statusCode, headers: jsonHeaders, body: JSON.stringify(body) }
}

function getPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  const international = digits.length === 10 ? `91${digits}` : digits
  return /^\d{8,15}$/.test(international) ? international : null
}

function templateKey(action) {
  return {
    invoice: 'WATOBOT_INVOICE_TEMPLATE',
    booking_notification: 'WATOBOT_BOOKING_NOTIFICATION_TEMPLATE',
    booking_confirmation: 'WATOBOT_BOOKING_CONFIRMATION_TEMPLATE',
  }[action]
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: jsonHeaders, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' })
  }

  const authorization = event.headers?.authorization || event.headers?.Authorization
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!accessToken) return respond(401, { error: 'Sign in to continue.' })

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return respond(400, { error: 'Invalid JSON body.' })
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return respond(400, { error: 'Invalid request body.' })
  }

  const { action, phone, text } = payload
  const to = getPhone(phone)
  if (!to) return respond(400, { error: 'Enter a valid phone number.' })
  if (!['invoice', 'booking_notification', 'booking_confirmation'].includes(action)) {
    return respond(501, {
      error: 'Only invoice and booking templates are enabled in the Watobot integration.',
    })
  }
  if (typeof text !== 'string' || !text.trim()) {
    return respond(400, { error: 'Message content is required.' })
  }

  const templateEnv = templateKey(action)
  const templateName = templateEnv ? process.env[templateEnv]?.trim() : null
  if (templateEnv && !templateName) {
    return respond(503, { error: 'The WhatsApp message template is not configured.' })
  }
  const messageText = text.trim()
  if (messageText.length > (templateEnv ? 1024 : 4096)) {
    return respond(400, { error: 'Message content is too long.' })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const watobotKey = process.env.WATOBOT_API_KEY
  const phoneNumberId = process.env.WATOBOT_PHONE_NUMBER_ID
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond(503, { error: 'WhatsApp authorization is not configured.' })
  }
  if (!watobotKey || !phoneNumberId || !/^\d+$/.test(phoneNumberId)) {
    return respond(503, { error: 'Watobot is not configured.' })
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
  const { data: userData, error: authError } = await authClient.auth.getUser(accessToken)
  if (authError || !userData.user) {
    return respond(401, { error: 'Your session has expired. Sign in again.' })
  }

  const { data: profile, error: profileError } = await authClient
    .from('profiles')
    .select('role, status')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (profileError) {
    return respond(502, { error: 'Could not verify manager permissions.' })
  }
  if (
    !profile ||
    !['admin', 'manager'].includes(profile.role) ||
    (profile.status != null && profile.status !== 'active')
  ) {
    return respond(403, { error: 'Only active managers can send WhatsApp messages.' })
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: used, error: limitError } = await serviceClient.rpc(
    'manager_whatsapp_consume_daily_limit',
    { p_actor_id: userData.user.id },
  )
  if (limitError) {
    if (limitError.message.includes('daily WhatsApp limit')) {
      return respond(429, { error: 'The 10-message daily WhatsApp limit has been reached.' })
    }
    if (limitError.code === '42501') {
      return respond(403, { error: 'Only active managers can send WhatsApp messages.' })
    }
    return respond(502, { error: 'Could not reserve a WhatsApp send.' })
  }

  const apiBase = (process.env.WATOBOT_API_URL || 'https://us-central1-wa-coexistence.cloudfunctions.net')
    .replace(/\/+$/, '')
  const apiMessage = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: process.env.WATOBOT_TEMPLATE_LANGUAGE || 'en' },
      components: [{
        type: 'body',
        parameters: [{ type: 'text', text: messageText }],
      }],
    },
  }

  let providerResponse
  try {
    providerResponse = await fetch(
      `${apiBase}/numbers/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${watobotKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiMessage),
        signal: AbortSignal.timeout(20000),
      },
    )
  } catch {
    return respond(502, { error: 'Watobot could not be reached. The send attempt used one daily slot.' })
  }

  const responseText = await providerResponse.text()
  let result = {}
  try {
    result = responseText ? JSON.parse(responseText) : {}
  } catch {
    result = {}
  }
  if (!providerResponse.ok) {
    const providerMessage = result?.error?.message
    return respond(providerResponse.status === 429 ? 429 : 502, {
      error: typeof providerMessage === 'string'
        ? providerMessage.slice(0, 300)
        : 'Watobot did not accept the message. The send attempt used one daily slot.',
    })
  }

  return respond(200, {
    ok: true,
    messageId: result?.messages?.[0]?.id || null,
    remaining: Math.max(0, 10 - Number(used)),
  })
}
