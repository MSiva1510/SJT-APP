// ─────────────────────────────────────────────────────────────────────
// DATA SERVICE LAYER
// Centralized data access for easier Supabase migration
// ─────────────────────────────────────────────────────────────────────

/**
 * Service configuration - can switch between localStorage and Supabase
 */
const SERVICE_CONFIG = {
  storage: 'localStorage',  // 'localStorage' or 'supabase' (future)
}

/**
 * Get current storage service
 * @returns {Object} Storage service interface
 */
function getStorageService() {
  if (SERVICE_CONFIG.storage === 'supabase') {
    // TODO: Return Supabase service
    // return supabaseService
  }
  return localStorageService
}

/**
 * localStorage service implementation
 */
const localStorageService = {
  /**
   * Get item from localStorage
   * @param {string} key - Storage key
   * @param {*} defaultValue - Default value if not found
   * @returns {*} Stored value or default
   */
  getItem(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch (error) {
      console.error(`Failed to get ${key} from storage:`, error)
      return defaultValue
    }
  },

  /**
   * Set item in localStorage
   * @param {string} key - Storage key
   * @param {*} value - Value to store
   * @returns {boolean} Success status
   */
  setItem(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch (error) {
      console.error(`Failed to set ${key} in storage:`, error)
      return false
    }
  },

  /**
   * Remove item from localStorage
   * @param {string} key - Storage key
   * @returns {boolean} Success status
   */
  removeItem(key) {
    try {
      localStorage.removeItem(key)
      return true
    } catch (error) {
      console.error(`Failed to remove ${key} from storage:`, error)
      return false
    }
  },

  /**
   * Check if key exists in localStorage
   * @param {string} key - Storage key
   * @returns {boolean} True if exists
   */
  hasItem(key) {
    try {
      return localStorage.getItem(key) !== null
    } catch (error) {
      return false
    }
  },

  /**
   * Get all keys from localStorage
   * @returns {string[]} Array of keys
   */
  getAllKeys() {
    try {
      return Object.keys(localStorage)
    } catch (error) {
      return []
    }
  },

  /**
   * Clear all items from localStorage
   * @returns {boolean} Success status
   */
  clear() {
    try {
      localStorage.clear()
      return true
    } catch (error) {
      console.error('Failed to clear storage:', error)
      return false
    }
  }
}

/**
 * Data Service - unified interface for all data operations
 */
export const dataService = {
  /**
   * Get item from storage
   * @param {string} key - Item key
   * @param {*} defaultValue - Default value
   * @returns {*} Item value
   */
  get(key, defaultValue = null) {
    return getStorageService().getItem(key, defaultValue)
  },

  /**
   * Set item in storage
   * @param {string} key - Item key
   * @param {*} value - Item value
   * @returns {boolean} Success status
   */
  set(key, value) {
    return getStorageService().setItem(key, value)
  },

  /**
   * Remove item from storage
   * @param {string} key - Item key
   * @returns {boolean} Success status
   */
  remove(key) {
    return getStorageService().removeItem(key)
  },

  /**
   * Check if item exists
   * @param {string} key - Item key
   * @returns {boolean} True if exists
   */
  has(key) {
    return getStorageService().hasItem(key)
  },

  /**
   * Get all storage keys
   * @returns {string[]} Array of keys
   */
  keys() {
    return getStorageService().getAllKeys()
  },

  /**
   * Clear all storage
   * @returns {boolean} Success status
   */
  clear() {
    return getStorageService().clear()
  },

  /**
   * Switch storage service (for future Supabase integration)
   * @param {string} serviceName - Service name ('localStorage' or 'supabase')
   */
  setService(serviceName) {
    SERVICE_CONFIG.storage = serviceName
  },

  /**
   * Get current service name
   * @returns {string} Current service name
   */
  getService() {
    return SERVICE_CONFIG.storage
  }
}

/**
 * Health check for data service
 * @returns {Object} Health status
 */
export function checkDataServiceHealth() {
  const service = SERVICE_CONFIG.storage
  let isHealthy = true
  let message = 'Data service is healthy'
  
  if (service === 'localStorage') {
    try {
      const testKey = '__sjt_health_check__'
      localStorage.setItem(testKey, 'ok')
      localStorage.removeItem(testKey)
    } catch (error) {
      isHealthy = false
      message = 'localStorage is not available or quota exceeded'
    }
  }
  
  return {
    service,
    isHealthy,
    message,
    timestamp: new Date().toISOString()
  }
}

export default dataService