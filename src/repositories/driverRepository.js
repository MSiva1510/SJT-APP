// ─────────────────────────────────────────────────────────────────────
// DRIVER REPOSITORY
// Handles driver data operations with Supabase and localStorage
// ─────────────────────────────────────────────────────────────────────

import { BaseRepository } from './baseRepository'
import supabase from '../lib/supabase'
import { getDatabaseProvider, DATABASE_PROVIDERS } from '../config/database'
import { dataService } from '../services/dataService'
import { cacheClear } from '../utils/dataCache'

const DRIVERS_STORAGE_KEY = 'sjt_drivers'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function toDbDriver(data = {}) {
  const payload = {
    driver_id: data.driver_id || (!UUID_RE.test(String(data.id || '')) ? data.id : undefined),
    name: data.name,
    phone: data.phone,
    license_number: data.license_number ?? data.license,
    status: data.status ?? (data.is_active === false ? 'offline' : undefined),
    joined_date: data.joined_date ?? data.joined,
    license_expiry: data.license_expiry,
    bank_name: data.bank_name,
    emergency_contact: data.emergency_contact,
    licence_image: data.licenceImage ?? data.licence_image,
    updated_at: data.updated_at ?? data.updatedAt,
  }
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

/**
 * DriverRepository - Manages driver data
 */
export class DriverRepository extends BaseRepository {
  constructor() {
    super('drivers', 'id')
  }

  /**
   * Get all drivers
   * @returns {Promise<Array>}
   */
  async getAll() {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      return this._getAllFromSupabase()
    }

    return this._getAllFromLocal()
  }

  /**
   * Get driver by ID
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getById(id) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      return this._getByIdFromSupabase(id)
    }

    return this._getByIdFromLocal(id)
  }

  /**
   * Search drivers by name
   * @param {string} name
   * @returns {Promise<Array>}
   */
  async searchByName(name) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      try {
        const { data, error } = await supabase
          .from('drivers')
          .select('id, driver_id, name, phone, status, license_number')
          .ilike('name', `%${name}%`)

        if (error) throw error
        return data || []
      } catch (error) {
        console.error('Search driver by name failed:', error)
        throw error
      }
    }

    return this._searchByNameLocal(name)
  }

  /**
   * Search drivers by phone
   * @param {string} phone
   * @returns {Promise<Array>}
   */
  async searchByPhone(phone) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      try {
        const { data, error } = await supabase
          .from('drivers')
          .select('id, driver_id, name, phone, license_number, status')
          .ilike('phone', `%${phone}%`)

        if (error) throw error
        return data || []
      } catch (error) {
        console.error('Search driver by phone failed:', error)
        throw error
      }
    }

    return this._searchByPhoneLocal(phone)
  }

  /**
   * Create driver
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async create(data) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      return this._createInSupabase(data)
    }

    return this._createInLocal(data)
  }

  /**
   * Update driver
   * @param {string} id
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async update(id, data) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      return this._updateInSupabase(id, data)
    }

    return this._updateInLocal(id, data)
  }

  /**
   * Delete driver
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      return this._deleteFromSupabase(id)
    }

    return this._deleteFromLocal(id)
  }

  /**
   * Update driver status
   * @param {string} id
   * @param {string} status - 'available' | 'assigned' | 'driving' | 'offline'
   * @returns {Promise<Object>}
   */
  async updateStatus(id, status) {
    return this.update(id, { status, updated_at: new Date().toISOString() })
  }

  /**
   * Get drivers with status
   * @param {string} status
   * @returns {Promise<Array>}
   */
  async getByStatus(status) {
    const drivers = await this.getAll()
    return drivers.filter(d => d.status === status)
  }

  /**
   * Upload driver license image
   * @param {string} driverId
   * @param {File} file
   * @returns {Promise<string>} URL of uploaded file
   */
  async uploadLicenseImage(driverId, file) {
    if (!supabase) {
      return null
    }

    try {
      const fileName = `driver-licenses/${driverId}-${Date.now()}.jpg`
      const { data, error } = await supabase.storage
        .from('documents')
        .upload(fileName, file, { upsert: false })

      if (error) throw error

      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(data.path)

      return urlData.publicUrl
    } catch (error) {
      console.error('License upload failed:', error)
      return null
    }
  }

  /**
   * Upload driver profile photo
   * @param {string} driverId
   * @param {File} file
   * @returns {Promise<string>} URL of uploaded file
   */
  async uploadProfilePhoto(driverId, file) {
    if (!supabase) {
      return null
    }

    try {
      const fileName = `driver-photos/${driverId}-${Date.now()}.jpg`
      const { data, error } = await supabase.storage
        .from('documents')
        .upload(fileName, file, { upsert: false })

      if (error) throw error

      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(data.path)

      return urlData.publicUrl
    } catch (error) {
      console.error('Profile photo upload failed:', error)
      return null
    }
  }

  /**
   * Get driver phone uniqueness status
   * @param {string} phone
   * @param {string} excludeId
   * @returns {Promise<boolean>}
   */
  async isPhoneUnique(phone, excludeId = null) {
    const drivers = await this.getAll()
    return !drivers.some(d => d.phone === phone && d.id !== excludeId)
  }

  /**
   * Get driver license uniqueness status
   * @param {string} licenseNumber
   * @param {string} excludeId
   * @returns {Promise<boolean>}
   */
  async isLicenseUnique(licenseNumber, excludeId = null) {
    const drivers = await this.getLookup()
    return !drivers.some(d => d.license_number === licenseNumber && d.id !== excludeId)
  }

  // ── LOCAL METHODS ──────────────────────────────────────────────

  _getAllFromLocal() {
    const items = dataService.get(DRIVERS_STORAGE_KEY, [])
    return Promise.resolve(items)
  }

  _getByIdFromLocal(id) {
    const items = dataService.get(DRIVERS_STORAGE_KEY, [])
    const item = items.find(d => d.id === id)
    return Promise.resolve(item || null)
  }

  _createInLocal(data) {
    const items = dataService.get(DRIVERS_STORAGE_KEY, [])
    const driver = {
      ...data,
      id: data.id || `DRV-${Date.now().toString().slice(-6)}`,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    items.push(driver)
    dataService.set(DRIVERS_STORAGE_KEY, items)
    return Promise.resolve(driver)
  }

  _updateInLocal(id, data) {
    const items = dataService.get(DRIVERS_STORAGE_KEY, [])
    const index = items.findIndex(d => d.id === id)
    if (index === -1) {
      return Promise.reject(new Error(`Driver ${id} not found`))
    }
    const updated = {
      ...items[index],
      ...data,
      updated_at: new Date().toISOString(),
    }
    items[index] = updated
    dataService.set(DRIVERS_STORAGE_KEY, items)
    return Promise.resolve(updated)
  }

  _deleteFromLocal(id) {
    const items = dataService.get(DRIVERS_STORAGE_KEY, [])
    const filtered = items.filter(d => d.id !== id)
    dataService.set(DRIVERS_STORAGE_KEY, filtered)
    return Promise.resolve(true)
  }

  _searchByNameLocal(name) {
    const items = dataService.get(DRIVERS_STORAGE_KEY, [])
    const lowerName = name.toLowerCase()
    return Promise.resolve(items.filter(d => d.name?.toLowerCase().includes(lowerName)))
  }

  _searchByPhoneLocal(phone) {
    const items = dataService.get(DRIVERS_STORAGE_KEY, [])
    return Promise.resolve(items.filter(d => d.phone?.includes(phone)))
  }

  async getLookup() {
    const provider = getDatabaseProvider()
    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      return this._getLookupFromSupabase()
    }
    return this._getLookupFromLocal()
  }

  _getLookupFromLocal() {
    const items = dataService.get(DRIVERS_STORAGE_KEY, [])
    return Promise.resolve(items.map(d => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      vehicle: d.vehicle,
      status: d.status,
      is_active: d.isActive !== false,
      license_number: d.license_number,
    })))
  }

  async _getLookupFromSupabase() {
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, driver_id, name, phone, status, license_number')
      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching driver lookup from Supabase:', error)
      throw error
    }
  }

  // ── SUPABASE METHODS ──────────────────────────────────────────

  async _getAllFromSupabase() {
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, driver_id, name, phone, license_number, status, joined_date, license_expiry, bank_name, emergency_contact, licence_image, created_at, updated_at')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching drivers from Supabase:', error)
      throw error
    }
  }

  async _getByIdFromSupabase(id) {
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, driver_id, name, phone, license_number, status, joined_date, license_expiry, bank_name, emergency_contact, licence_image, created_at, updated_at')
        .eq(UUID_RE.test(String(id)) ? 'id' : 'driver_id', id)
        .single()

      if (error && error.code === 'PGRST116') {
        return null
      }

      if (error) throw error
      return data || null
    } catch (error) {
      console.error('Error fetching driver from Supabase:', error)
      throw error
    }
  }

  async _createInSupabase(data) {
    try {
      const driver = {
        ...toDbDriver(data),
        driver_id: data.driver_id || (!UUID_RE.test(String(data.id || '')) ? data.id : null) || `DRV-${Date.now().toString().slice(-6)}`,
        created_at: data.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { data: created, error } = await supabase
        .from('drivers')
        .insert([driver])
        .select()
        .single()

      if (error) throw error
      cacheClear('drivers')
      return created
    } catch (error) {
      console.error('Error creating driver in Supabase:', error)
      throw error
    }
  }

  async _updateInSupabase(id, data) {
    try {
      const { data: updated, error } = await supabase
        .from('drivers')
        .update({
          ...toDbDriver(data),
          updated_at: new Date().toISOString(),
        })
        .eq(UUID_RE.test(String(id)) ? 'id' : 'driver_id', id)
        .select()
        .single()

      if (error) throw error
      cacheClear('drivers')
      return updated
    } catch (error) {
      console.error('Error updating driver in Supabase:', error)
      throw error
    }
  }

  async _deleteFromSupabase(id) {
    try {
      const { error } = await supabase
        .from('drivers')
        .delete()
        .eq(UUID_RE.test(String(id)) ? 'id' : 'driver_id', id)

      if (error) throw error
      cacheClear('drivers')
      return true
    } catch (error) {
      console.error('Error deleting driver from Supabase:', error)
      throw error
    }
  }
}

export const driverRepository = new DriverRepository()
export default DriverRepository
