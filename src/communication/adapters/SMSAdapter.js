// ─── SMS Adapter ──────────────────────────────────────────────
// Provider-independent. Supports future: Twilio, MSG91, Fast2SMS, TextLocal

export const SMS_PROVIDERS = {
  TWILIO:    'twilio',
  MSG91:     'msg91',
  FAST2SMS:  'fast2sms',
  TEXTLOCAL: 'textlocal',
}

class SMSAdapterBase {
  constructor(providerName) {
    this.providerName = providerName
    this.isConfigured = false
  }

  async _send(to, message) {
    throw new Error(`${this.providerName}: _send() not implemented`)
  }

  async sendSMS(to, message) {
    if (!this.isConfigured) {
      console.info(`[SMS/${this.providerName}] Not configured. Would send to ${to}: ${message.slice(0,40)}…`)
      return { channel:'sms', status:'not_configured', provider:this.providerName }
    }
    return this._send(to, message)
  }

  async sendOTP(to, otp) {
    const message = `Your Sri Jayam Travels OTP is: ${otp}. Valid for 10 minutes. Do not share.`
    return this.sendSMS(to, message)
  }

  async sendReminder(to, reminderText) {
    return this.sendSMS(to, reminderText)
  }

  getProviderInfo() {
    return { name: this.providerName, configured: this.isConfigured, channel: 'sms' }
  }
}

class TwilioSMSAdapter extends SMSAdapterBase {
  constructor() { super(SMS_PROVIDERS.TWILIO) }
  // async _send(to, message) { /* POST to api.twilio.com/2010-04-01/Accounts/{SID}/Messages */ }
}

class MSG91Adapter extends SMSAdapterBase {
  constructor() { super(SMS_PROVIDERS.MSG91) }
  // async _send(to, message) { /* POST to api.msg91.com/api/v5/otp */ }
}

class Fast2SMSAdapter extends SMSAdapterBase {
  constructor() { super(SMS_PROVIDERS.FAST2SMS) }
  // async _send(to, message) { /* POST to www.fast2sms.com/dev/bulkV2 */ }
}

class TextLocalAdapter extends SMSAdapterBase {
  constructor() { super(SMS_PROVIDERS.TEXTLOCAL) }
  // async _send(to, message) { /* POST to api.textlocal.in/send */ }
}

const PROVIDER_REGISTRY = {
  [SMS_PROVIDERS.TWILIO]:    new TwilioSMSAdapter(),
  [SMS_PROVIDERS.MSG91]:     new MSG91Adapter(),
  [SMS_PROVIDERS.FAST2SMS]:  new Fast2SMSAdapter(),
  [SMS_PROVIDERS.TEXTLOCAL]: new TextLocalAdapter(),
}

let _activeAdapter = new SMSAdapterBase('none')

export function setSMSProvider(providerName) {
  if (PROVIDER_REGISTRY[providerName]) _activeAdapter = PROVIDER_REGISTRY[providerName]
  else console.warn(`[SMS] Unknown provider: ${providerName}`)
}

export function getSMSAdapter() { return _activeAdapter }

export const sms = {
  send:     (to, msg)  => _activeAdapter.sendSMS(to, msg),
  sendOTP:  (to, otp)  => _activeAdapter.sendOTP(to, otp),
  reminder: (to, text) => _activeAdapter.sendReminder(to, text),
  providerInfo: ()     => _activeAdapter.getProviderInfo(),
}
