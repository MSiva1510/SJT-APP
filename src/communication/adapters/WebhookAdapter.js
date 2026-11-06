// ─── Webhook Adapter ──────────────────────────────────────────
// Future-ready REST webhook dispatching.
// Supports: Slack, Zoho, SAP, CRM, Discord, Telegram, Generic REST

export const WEBHOOK_TARGETS = {
  GENERIC_REST: 'generic_rest',
  SLACK:        'slack',
  DISCORD:      'discord',
  TELEGRAM:     'telegram',
  ZOHO_CRM:     'zoho_crm',
}

class WebhookAdapterBase {
  constructor(targetName) {
    this.targetName = targetName
    this.isConfigured = false
    this.endpoints = []
  }

  async _post(url, payload, headers = {}) {
    // Actual fetch would happen here when configured
    // Never expose API keys in frontend — always proxy through Supabase Edge Function
    throw new Error(`${this.targetName}: _post() not implemented — use Supabase Edge Function`)
  }

  async dispatch(eventType, payload) {
    if (!this.isConfigured) {
      console.info(`[Webhook/${this.targetName}] Not configured. Event: ${eventType}`)
      return { channel:'webhook', status:'not_configured', target:this.targetName }
    }
    return this._post(this.endpoints[0], { event: eventType, ...payload })
  }

  registerEndpoint(url) {
    this.endpoints.push(url)
  }

  getProviderInfo() {
    return { name: this.targetName, configured: this.isConfigured, channel: 'webhook', endpoints: this.endpoints.length }
  }
}

class GenericRESTAdapter extends WebhookAdapterBase {
  constructor() { super(WEBHOOK_TARGETS.GENERIC_REST) }
}

class SlackAdapter extends WebhookAdapterBase {
  constructor() { super(WEBHOOK_TARGETS.SLACK) }
  async dispatch(eventType, payload) {
    if (!this.isConfigured) return { channel:'webhook', status:'not_configured', target:'slack' }
    const text = `*${eventType}*\n${JSON.stringify(payload, null, 2)}`
    return this._post(this.endpoints[0], { text })
  }
}

class DiscordAdapter extends WebhookAdapterBase {
  constructor() { super(WEBHOOK_TARGETS.DISCORD) }
  async dispatch(eventType, payload) {
    if (!this.isConfigured) return { channel:'webhook', status:'not_configured', target:'discord' }
    const content = `**${eventType}**\n\`\`\`${JSON.stringify(payload, null, 2)}\`\`\``
    return this._post(this.endpoints[0], { content })
  }
}

class TelegramAdapter extends WebhookAdapterBase {
  constructor() { super(WEBHOOK_TARGETS.TELEGRAM) }
}

class ZohoCRMAdapter extends WebhookAdapterBase {
  constructor() { super(WEBHOOK_TARGETS.ZOHO_CRM) }
}

const PROVIDER_REGISTRY = {
  [WEBHOOK_TARGETS.GENERIC_REST]: new GenericRESTAdapter(),
  [WEBHOOK_TARGETS.SLACK]:        new SlackAdapter(),
  [WEBHOOK_TARGETS.DISCORD]:      new DiscordAdapter(),
  [WEBHOOK_TARGETS.TELEGRAM]:     new TelegramAdapter(),
  [WEBHOOK_TARGETS.ZOHO_CRM]:     new ZohoCRMAdapter(),
}

let _activeAdapters = []

export function registerWebhookTarget(targetName, endpointUrl) {
  if (PROVIDER_REGISTRY[targetName]) {
    PROVIDER_REGISTRY[targetName].registerEndpoint(endpointUrl)
    PROVIDER_REGISTRY[targetName].isConfigured = true
    if (!_activeAdapters.includes(PROVIDER_REGISTRY[targetName])) {
      _activeAdapters.push(PROVIDER_REGISTRY[targetName])
    }
  }
}

export const webhook = {
  dispatch:     (event, payload)       => Promise.all(_activeAdapters.map(a => a.dispatch(event, payload))),
  register:     (target, url)          => registerWebhookTarget(target, url),
  providerInfo: ()                     => _activeAdapters.map(a => a.getProviderInfo()),
}
