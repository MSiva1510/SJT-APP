// ─────────────────────────────────────────────────────────────────────
// FORM VALIDATION UTILITIES
// Centralized validation rules and helpers
// ─────────────────────────────────────────────────────────────────────

export const VALIDATION_RULES = {
  // Text fields
  name: {
    maxLength: 60,
    pattern: /^[a-zA-Z\s\-'.]*$/,
    message: 'Name can only contain letters, spaces, hyphens, and apostrophes (max 60 chars)'
  },
  firstName: {
    maxLength: 30,
    pattern: /^[a-zA-Z\s\-'.]*$/,
    message: 'First name can only contain letters, spaces, hyphens, and apostrophes (max 30 chars)'
  },
  lastName: {
    maxLength: 30,
    pattern: /^[a-zA-Z\s\-'.]*$/,
    message: 'Last name can only contain letters, spaces, hyphens, and apostrophes (max 30 chars)'
  },
  companyName: {
    maxLength: 60,
    pattern: /^[a-zA-Z0-9\s\-'.&()]*$/,
    message: 'Company name can contain letters, numbers, spaces, and some symbols (max 60 chars)'
  },
  email: {
    maxLength: 100,
    pattern: /^[^\s]*@?[^\s]*\.?[^\s]*$/,
    message: 'Please enter a valid email address (max 100 chars)'
  },
  phone: {
    maxLength: 10,
    pattern: /^[0-9]*$/,
    message: 'Phone number must contain only digits (max 10 chars)'
  },
  // Location/address fields
  location: {
    maxLength: 100,
    pattern: /^[a-zA-Z0-9\s\-',./]*$/,
    message: 'Location can contain letters, numbers, spaces, and basic punctuation (max 100 chars)'
  },
  address: {
    maxLength: 200,
    pattern: /^[a-zA-Z0-9\s\-',./]*$/,
    message: 'Address can contain letters, numbers, spaces, and basic punctuation (max 200 chars)'
  },
  // Numeric fields
  gst: {
    maxLength: 15,
    pattern: /^[0-9A-Z]*$/,
    message: 'GST number must be alphanumeric (max 15 chars)'
  },
  notes: {
    maxLength: 300,
    pattern: /^[\s\S]*$/,  // Allow any character
    message: 'Notes cannot exceed 300 characters'
  },
  tripNotes: {
    maxLength: 500,
    pattern: /^[\s\S]*$/,
    message: 'Trip notes cannot exceed 500 characters'
  },
  licenseNumber: {
    maxLength: 20,
    pattern: /^[a-zA-Z0-9\s\-]*$/,
    message: 'License number format invalid (max 20 chars)'
  },
  vehicleNumber: {
    maxLength: 20,
    pattern: /^[a-zA-Z0-9]*$/,
    message: 'Vehicle number must be alphanumeric (max 20 chars)'
  },
}

/**
 * Validate a single field against its rule
 * @param {string} fieldName - The field identifier (e.g., 'name', 'email')
 * @param {string} value - The value to validate
 * @returns {string|null} - Error message if invalid, null if valid
 */
export function validateField(fieldName, value) {
  if (!value) {
    return null  // Empty field is valid at this level; 'required' is separate
  }
  
  const rule = VALIDATION_RULES[fieldName]
  if (!rule) return null  // No rule found; assume valid
  
  // Check maxLength
  if (rule.maxLength && value.length > rule.maxLength) {
    return rule.message
  }
  
  // Check pattern
  if (rule.pattern && !rule.pattern.test(value)) {
    return rule.message
  }
  
  return null
}

/**
 * Validate multiple fields at once
 * @param {Object} formData - Object with field names and values
 * @param {string[]} requiredFields - Array of field names that must have values
 * @returns {Object} - Object with field names and error messages
 */
export function validateForm(formData, requiredFields = []) {
  const errors = {}
  
  // Check required fields
  requiredFields.forEach(fieldName => {
    const value = formData[fieldName]
    if (!value || (typeof value === 'string' && !value.trim())) {
      errors[fieldName] = `${fieldName.replace(/([A-Z])/g, ' $1').trim()} is required`
    }
  })
  
  // Validate non-empty fields against rules
  Object.keys(formData).forEach(fieldName => {
    if (!errors[fieldName] && formData[fieldName]) {
      const error = validateField(fieldName, formData[fieldName])
      if (error) errors[fieldName] = error
    }
  })
  
  return errors
}

/**
 * Restrict input to max length and pattern
 * @param {string} value - The input value
 * @param {string} fieldName - The field identifier
 * @returns {string} - Sanitized value
 */
export function sanitizeInput(value, fieldName) {
  if (!value) return value
  
  const rule = VALIDATION_RULES[fieldName]
  if (!rule) return value
  
  // Apply maxLength
  let sanitized = value.slice(0, rule.maxLength)
  
  // For numeric fields, remove non-digits
  if (fieldName === 'phone' && rule.pattern === VALIDATION_RULES.phone.pattern) {
    sanitized = sanitized.replace(/\D/g, '')
  }
  
  return sanitized
}

/**
 * Check if all required fields have values
 * @param {Object} formData - Object with field names and values
 * @param {string[]} requiredFields - Array of required field names
 * @returns {boolean} - True if all required fields have values
 */
export function hasRequiredFields(formData, requiredFields) {
  return requiredFields.every(
    fieldName => formData[fieldName] && (typeof formData[fieldName] === 'string' ? formData[fieldName].trim() : formData[fieldName])
  )
}

/**
 * Format error messages for display
 * @param {Object} errors - Object with field names and error messages
 * @returns {string[]} - Array of formatted error messages
 */
export function formatErrorMessages(errors) {
  return Object.entries(errors)
    .map(([field, message]) => message)
    .filter(Boolean)
}