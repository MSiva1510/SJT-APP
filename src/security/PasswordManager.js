// ─── Password Manager ─────────────────────────────────────────
// Password strength validation, rules, and change workflow.
// No external deps — pure JS.

export const PASSWORD_RULES = {
  minLength:        8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber:    true,
  requireSpecial:   false,
}

export const STRENGTH_LEVELS = {
  0: { label:'Very Weak', color:'bg-red-500',    text:'text-red-500',    score:0  },
  1: { label:'Weak',      color:'bg-orange-500', text:'text-orange-500', score:25 },
  2: { label:'Fair',      color:'bg-yellow-500', text:'text-yellow-500', score:50 },
  3: { label:'Strong',    color:'bg-blue-500',   text:'text-blue-500',   score:75 },
  4: { label:'Very Strong',color:'bg-emerald-500',text:'text-emerald-500',score:100},
}

/** Evaluate password strength 0–4. */
export function getPasswordStrength(password = '') {
  let score = 0
  if (!password) return { level:0, ...STRENGTH_LEVELS[0], checks:getChecks(password) }
  if (password.length >= 8)  score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  const level = Math.min(4, score - (score > 2 ? 0 : 0))
  const clamped = Math.min(4, Math.max(0, score - 1))
  return { level: clamped, ...STRENGTH_LEVELS[clamped], checks: getChecks(password) }
}

/** Individual rule checks. */
export function getChecks(password = '') {
  return [
    { label:`Min ${PASSWORD_RULES.minLength} characters`, pass: password.length >= PASSWORD_RULES.minLength },
    { label:'Uppercase letter',   pass: /[A-Z]/.test(password) },
    { label:'Lowercase letter',   pass: /[a-z]/.test(password) },
    { label:'Number',             pass: /[0-9]/.test(password) },
    { label:'Special character',  pass: /[^A-Za-z0-9]/.test(password) },
  ]
}

/** Validate password against configurable rules. Returns array of error strings. */
export function validatePassword(password = '', rules = PASSWORD_RULES) {
  const errors = []
  if (password.length < rules.minLength)
    errors.push(`Password must be at least ${rules.minLength} characters`)
  if (rules.requireUppercase && !/[A-Z]/.test(password))
    errors.push('Password must contain at least one uppercase letter')
  if (rules.requireLowercase && !/[a-z]/.test(password))
    errors.push('Password must contain at least one lowercase letter')
  if (rules.requireNumber && !/[0-9]/.test(password))
    errors.push('Password must contain at least one number')
  if (rules.requireSpecial && !/[^A-Za-z0-9]/.test(password))
    errors.push('Password must contain at least one special character')
  return errors
}

/** Check if two passwords match. */
export function passwordsMatch(a, b) {
  return a === b
}

/** Mask password for display (e.g. logs). */
export function maskPassword(pwd = '') {
  return '•'.repeat(Math.min(pwd.length, 12))
}

/** Generate a secure random password meeting all rules. */
export function generatePassword(length = 12) {
  const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lower   = 'abcdefghijklmnopqrstuvwxyz'
  const digits  = '0123456789'
  const special = '!@#$%^&*'
  const all     = upper + lower + digits + special
  let pwd = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ]
  for (let i = pwd.length; i < length; i++) {
    pwd.push(all[Math.floor(Math.random() * all.length)])
  }
  return pwd.sort(() => Math.random() - 0.5).join('')
}
