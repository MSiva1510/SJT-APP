// ─── WhatsApp Adapter ─────────────────────────────────────────
// Provider-independent interface. Zero API calls made here.
// Swap the PROVIDER constant to change the underlying service.
// Supported future providers:
//   whatsapp_cloud_api | twilio | gupshup | interakt | aisensy | wati | 360dialog

export const WHATSAPP_PROVIDERS = {
  WHATSAPP_CLOUD_API: 'whatsapp_cloud_api',
  TWILIO:             'twilio',
  GUPSHUP:            'gupshup',
  INTERAKT:           'interakt',
  AISENSY:            'aisensy',
  WATI:               'wati',
  DIALOG360:          '360dialog',
}

// ── Message templates ─────────────────────────────────────────
export const WA_TEMPLATES = {
  BOOKING_CONFIRMATION: {
    id: 'booking_confirmation',
    build: (data) => ({
      type: 'text',
      body: [
        `🚗 *Booking Confirmed!*`,
        ``,
        `📋 Booking: ${data.bookingNo || '—'}`,
        `👤 Customer: ${data.customer || '—'}`,
        `📍 Pickup: ${data.pickup || '—'}`,
        `🏁 Drop: ${data.drop || '—'}`,
        `📅 Date: ${data.startDate || '—'}`,
        `⏰ Time: ${data.startTime || 'TBD'}`,
        `💰 Fare: Rs. ${data.fare ? Number(data.fare).toLocaleString('en-IN') : '—'}`,
        ``,
        `Thank you for choosing Sri Jayam Travels! 🙏`,
      ].join('\n'),
    }),
  },
  DRIVER_ASSIGNED: {
    id: 'driver_assigned',
    build: (data) => ({
      type: 'text',
      body: [
        `✅ *Driver Assigned!*`,
        ``,
        `📋 Booking: ${data.bookingNo || '—'}`,
        `🧑‍✈️ Driver: ${data.driverName || '—'}`,
        `📞 Mobile: ${data.driverMobile || '—'}`,
        `🚘 Vehicle: ${data.vehicleReg || '—'}`,
        ``,
        `Your driver will arrive at the pickup location on time.`,
        `Sri Jayam Travels`,
      ].join('\n'),
    }),
  },
  TRIP_STARTED: {
    id: 'trip_started',
    build: (data) => ({
      type: 'text',
      body: [
        `🚗 *Trip Started!*`,
        ``,
        `📋 Booking: ${data.bookingNo || '—'}`,
        `🧑‍✈️ Driver: ${data.driverName || '—'}`,
        `🚘 Vehicle: ${data.vehicleReg || '—'}`,
        ``,
        `Have a safe journey! 🙏`,
        `Sri Jayam Travels`,
      ].join('\n'),
    }),
  },
  TRIP_COMPLETED: {
    id: 'trip_completed',
    build: (data) => ({
      type: 'text',
      body: [
        `🏁 *Trip Completed!*`,
        ``,
        `📋 Booking: ${data.bookingNo || '—'}`,
        `💰 Total Fare: Rs. ${data.fare ? Number(data.fare).toLocaleString('en-IN') : '—'}`,
        ``,
        `Thank you for travelling with Sri Jayam Travels! 🙏`,
        `We hope to serve you again.`,
      ].join('\n'),
    }),
  },
  BOOKING_CANCELLED: {
    id: 'booking_cancelled',
    build: (data) => ({
      type: 'text',
      body: [
        `❌ *Booking Cancelled*`,
        ``,
        `📋 Booking: ${data.bookingNo || '—'}`,
        ``,
        `We regret the inconvenience. Please contact us for further assistance.`,
        `Sri Jayam Travels`,
      ].join('\n'),
    }),
  },
  INVOICE_GENERATED: {
    id: 'invoice_generated',
    build: (data) => ({
      type: 'text',
      body: [
        `🧾 *Invoice Generated*`,
        ``,
        `📋 Invoice: ${data.invoiceNo || '—'}`,
        `💰 Amount: Rs. ${data.amount ? Number(data.amount).toLocaleString('en-IN') : '—'}`,
        `📅 Due Date: ${data.dueDate || '—'}`,
        ``,
        `Sri Jayam Travels`,
      ].join('\n'),
    }),
  },
  PAYMENT_REMINDER: {
    id: 'payment_reminder',
    build: (data) => ({
      type: 'text',
      body: [
        `⚠️ *Payment Reminder*`,
        ``,
        `Invoice: ${data.invoiceNo || '—'}`,
        `Amount Due: Rs. ${data.amount ? Number(data.amount).toLocaleString('en-IN') : '—'}`,
        `Due Date: ${data.dueDate || '—'}`,
        ``,
        `Please clear your dues at your earliest convenience.`,
        `Sri Jayam Travels`,
      ].join('\n'),
    }),
  },
  DRIVER_TRIP_ASSIGNMENT: {
    id: 'driver_trip_assignment',
    build: (data) => ({
      type: 'text',
      body: [
        `📲 *New Trip Assigned*`,
        ``,
        `📋 Booking: ${data.bookingNo || '—'}`,
        `👤 Customer: ${data.customer || '—'}`,
        `📞 Contact: ${data.contact || '—'}`,
        `📍 Pickup: ${data.pickup || '—'}`,
        `🏁 Drop: ${data.drop || '—'}`,
        `📅 Date: ${data.startDate || '—'}`,
        `⏰ Time: ${data.startTime || '—'}`,
        ``,
        `Please confirm your availability.`,
        `Sri Jayam Travels`,
      ].join('\n'),
    }),
  },
  SALARY_PROCESSED: {
    id: 'salary_processed',
    build: (data) => ({
      type: 'text',
      body: [
        `💰 *Salary Processed*`,
        ``,
        `👤 Name: ${data.driverName || '—'}`,
        `💵 Net Amount: Rs. ${data.netAmount ? Number(data.netAmount).toLocaleString('en-IN') : '—'}`,
        `📅 Period: ${data.period || '—'}`,
        ``,
        `Sri Jayam Travels HR`,
      ].join('\n'),
    }),
  },
  DOCUMENT_EXPIRY_REMINDER: {
    id: 'document_expiry_reminder',
    build: (data) => ({
      type: 'text',
      body: [
        `⚠️ *Document Expiry Reminder*`,
        ``,
        `📄 Document: ${data.docType || '—'}`,
        `🚘 Vehicle/Driver: ${data.entityName || '—'}`,
        `📅 Expires On: ${data.expiryDate || '—'}`,
        ``,
        `Please renew before expiry.`,
        `Sri Jayam Travels`,
      ].join('\n'),
    }),
  },
}

// ── Base adapter interface ────────────────────────────────────
class WhatsAppAdapterBase {
  constructor(providerName) {
    this.providerName = providerName
    this.isConfigured = false
  }

  /** Must be implemented by concrete provider. */
  async _send(to, message) {
    throw new Error(`${this.providerName}: _send() not implemented`)
  }

  /** Build deep-link URL (works without API) */
  buildDeepLink(phone, message) {
    const digits = String(phone).replace(/\D/g, '')
    const num    = digits.length === 10 ? `91${digits}` : digits
    return `https://wa.me/${num}?text=${encodeURIComponent(message)}`
  }

  /** Open WhatsApp in browser (no API required) */
  openChat(phone, message = '') {
    const url = this.buildDeepLink(phone, message)
    window.open(url, '_blank', 'noopener,noreferrer')
    return { channel: 'whatsapp', status: 'opened', provider: 'deeplink', url }
  }

  /** Generic send — routes to deep-link until real provider configured */
  async sendMessage(to, message) {
    if (!this.isConfigured) {
      return { channel:'whatsapp', status:'deeplink', provider:'deeplink', url: this.buildDeepLink(to, message) }
    }
    return this._send(to, message)
  }

  async sendDocument(to, documentUrl, caption = '') {
    return { channel:'whatsapp', status:'queued', provider:this.providerName, payload:{ to, documentUrl, caption } }
  }

  async sendImage(to, imageUrl, caption = '') {
    return { channel:'whatsapp', status:'queued', provider:this.providerName, payload:{ to, imageUrl, caption } }
  }

  async sendLocation(to, lat, lng, name = '') {
    return { channel:'whatsapp', status:'queued', provider:this.providerName, payload:{ to, lat, lng, name } }
  }

  async sendInvoice(to, invoiceData) {
    const msg = WA_TEMPLATES.INVOICE_GENERATED.build(invoiceData).body
    return this.sendMessage(to, msg)
  }

  async sendTripDetails(to, tripData) {
    const msg = WA_TEMPLATES.BOOKING_CONFIRMATION.build(tripData).body
    return this.sendMessage(to, msg)
  }

  async sendDriverDetails(to, tripData) {
    const msg = WA_TEMPLATES.DRIVER_ASSIGNED.build(tripData).body
    return this.sendMessage(to, msg)
  }

  async sendPaymentReceipt(to, paymentData) {
    const msg = WA_TEMPLATES.INVOICE_GENERATED.build(paymentData).body
    return this.sendMessage(to, msg)
  }

  getProviderInfo() {
    return { name: this.providerName, configured: this.isConfigured, channel: 'whatsapp' }
  }
}

// ── Concrete provider stubs (to be filled when APIs are connected) ──

class WhatsAppCloudAPIAdapter extends WhatsAppAdapterBase {
  constructor() { super(WHATSAPP_PROVIDERS.WHATSAPP_CLOUD_API) }
  // TODO: inject config from communication_providers table
  // async _send(to, message) { /* POST to graph.facebook.com */ }
}

class TwilioWhatsAppAdapter extends WhatsAppAdapterBase {
  constructor() { super(WHATSAPP_PROVIDERS.TWILIO) }
  // TODO: inject config from communication_providers table
  // async _send(to, message) { /* POST to api.twilio.com */ }
}

class GupshupAdapter extends WhatsAppAdapterBase {
  constructor() { super(WHATSAPP_PROVIDERS.GUPSHUP) }
}

class InteraktAdapter extends WhatsAppAdapterBase {
  constructor() { super(WHATSAPP_PROVIDERS.INTERAKT) }
}

class AiSensyAdapter extends WhatsAppAdapterBase {
  constructor() { super(WHATSAPP_PROVIDERS.AISENSY) }
}

class WATIAdapter extends WhatsAppAdapterBase {
  constructor() { super(WHATSAPP_PROVIDERS.WATI) }
}

class Dialog360Adapter extends WhatsAppAdapterBase {
  constructor() { super(WHATSAPP_PROVIDERS.DIALOG360) }
}

// ── Provider registry ─────────────────────────────────────────
const PROVIDER_REGISTRY = {
  [WHATSAPP_PROVIDERS.WHATSAPP_CLOUD_API]: new WhatsAppCloudAPIAdapter(),
  [WHATSAPP_PROVIDERS.TWILIO]:             new TwilioWhatsAppAdapter(),
  [WHATSAPP_PROVIDERS.GUPSHUP]:            new GupshupAdapter(),
  [WHATSAPP_PROVIDERS.INTERAKT]:           new InteraktAdapter(),
  [WHATSAPP_PROVIDERS.AISENSY]:            new AiSensyAdapter(),
  [WHATSAPP_PROVIDERS.WATI]:               new WATIAdapter(),
  [WHATSAPP_PROVIDERS.DIALOG360]:          new Dialog360Adapter(),
}

// ── Active adapter (default: deep-link, no API) ───────────────
let _activeAdapter = new WhatsAppAdapterBase('deeplink')

export function setWhatsAppProvider(providerName) {
  if (PROVIDER_REGISTRY[providerName]) {
    _activeAdapter = PROVIDER_REGISTRY[providerName]
  } else {
    console.warn(`[WhatsApp] Unknown provider: ${providerName}`)
  }
}

export function getWhatsAppAdapter() {
  return _activeAdapter
}

// ── Convenience exports ───────────────────────────────────────
export const whatsapp = {
  send:           (to, msg)       => _activeAdapter.sendMessage(to, msg),
  sendDocument:   (to, url, cap)  => _activeAdapter.sendDocument(to, url, cap),
  sendImage:      (to, url, cap)  => _activeAdapter.sendImage(to, url, cap),
  sendLocation:   (to, lat, lng)  => _activeAdapter.sendLocation(to, lat, lng),
  sendInvoice:    (to, data)      => _activeAdapter.sendInvoice(to, data),
  sendTripDetails:(to, data)      => _activeAdapter.sendTripDetails(to, data),
  sendDriverDetails:(to,data)     => _activeAdapter.sendDriverDetails(to, data),
  sendPaymentReceipt:(to,data)    => _activeAdapter.sendPaymentReceipt(to, data),
  openChat:       (phone, msg)    => _activeAdapter.openChat(phone, msg),
  deepLink:       (phone, msg)    => _activeAdapter.buildDeepLink(phone, msg),
  template:       (id, data)      => WA_TEMPLATES[id]?.build(data),
  providerInfo:   ()              => _activeAdapter.getProviderInfo(),
}
