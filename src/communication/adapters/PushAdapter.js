// ─── Push Notification Adapter ───────────────────────────────
// Provider-independent. Supports future: FCM (Android/Web), APNs (iOS), Flutter

export const PUSH_PROVIDERS = {
  FCM:     'fcm',      // Firebase Cloud Messaging
  APNS:    'apns',     // Apple Push Notification Service
  FLUTTER: 'flutter',  // Flutter local / remote notifications
}

export const PUSH_NOTIFICATION_TYPES = {
  TRIP:        'trip',
  BOOKING:     'booking',
  ATTENDANCE:  'attendance',
  DRIVER:      'driver',
  VEHICLE:     'vehicle',
  FINANCE:     'finance',
  MAINTENANCE: 'maintenance',
  SYSTEM:      'system',
}

class PushAdapterBase {
  constructor(providerName) {
    this.providerName = providerName
    this.isConfigured = false
    this._subscriptions = new Map()
  }

  async _sendToToken(token, payload) {
    throw new Error(`${this.providerName}: _sendToToken() not implemented`)
  }

  async sendPush(token, { title, body, type, data = {} }) {
    if (!this.isConfigured) {
      console.info(`[Push/${this.providerName}] Not configured. Payload: ${title}`)
      return { channel:'push', status:'not_configured', provider:this.providerName }
    }
    return this._sendToToken(token, { title, body, type, data })
  }

  async subscribe(token, userId) {
    this._subscriptions.set(userId, token)
    return { status:'subscribed', userId, token: token.slice(0,10)+'…' }
  }

  async unsubscribe(userId) {
    this._subscriptions.delete(userId)
    return { status:'unsubscribed', userId }
  }

  getSubscriptionCount() { return this._subscriptions.size }
  getProviderInfo()      { return { name:this.providerName, configured:this.isConfigured, channel:'push', subscriptions:this.getSubscriptionCount() } }
}

class FCMAdapter extends PushAdapterBase {
  constructor() { super(PUSH_PROVIDERS.FCM) }
  // async _sendToToken(token, payload) { /* POST to fcm.googleapis.com/v1/projects/{id}/messages:send */ }
}

class APNsAdapter extends PushAdapterBase {
  constructor() { super(PUSH_PROVIDERS.APNS) }
  // async _sendToToken(token, payload) { /* POST to api.development.push.apple.com */ }
}

class FlutterPushAdapter extends PushAdapterBase {
  constructor() { super(PUSH_PROVIDERS.FLUTTER) }
  // Bridges to flutter_local_notifications / firebase_messaging
}

const PROVIDER_REGISTRY = {
  [PUSH_PROVIDERS.FCM]:     new FCMAdapter(),
  [PUSH_PROVIDERS.APNS]:    new APNsAdapter(),
  [PUSH_PROVIDERS.FLUTTER]: new FlutterPushAdapter(),
}

let _activeAdapter = new PushAdapterBase('none')

export function setPushProvider(providerName) {
  if (PROVIDER_REGISTRY[providerName]) _activeAdapter = PROVIDER_REGISTRY[providerName]
  else console.warn(`[Push] Unknown provider: ${providerName}`)
}

export function getPushAdapter() { return _activeAdapter }

export const push = {
  send:        (token, payload) => _activeAdapter.sendPush(token, payload),
  subscribe:   (token, userId)  => _activeAdapter.subscribe(token, userId),
  unsubscribe: (userId)         => _activeAdapter.unsubscribe(userId),
  providerInfo: ()              => _activeAdapter.getProviderInfo(),
}
