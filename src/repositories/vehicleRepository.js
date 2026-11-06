// ─────────────────────────────────────────────────────────────────────
// VEHICLE REPOSITORY
// Handles vehicle data operations with Supabase and localStorage
// ─────────────────────────────────────────────────────────────────────

import { BaseRepository } from './baseRepository'
import supabase from '../lib/supabase'
import { getDatabaseProvider, DATABASE_PROVIDERS } from '../config/database'
import { dataService } from '../services/dataService'
import { cacheClear } from '../utils/dataCache'

const VEHICLES_STORAGE_KEY = 'sjt_vehicles'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function toDbVehicle(data = {}) {
  const payload = {
    vehicle_id: data.vehicle_id || (!UUID_RE.test(String(data.id || '')) ? data.id : undefined),
    registration: data.registration ?? data.reg,
    vehicle_type: data.vehicle_type ?? data.type,
    model: data.model,
    year: data.year,
    color: data.color,
    fuel_type: data.fuel_type ?? data.fuel,
    status: data.status,
    current_km: data.current_km ?? data.km,
    engine_number: data.engine_number,
    imei: data.imei,
    updated_at: data.updated_at ?? data.updatedAt,
  }
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

/**
 * VehicleRepository - Manages vehicle data
 */
export class VehicleRepository extends BaseRepository {
  constructor() {
    super('vehicles', 'id')
  }

  /**
   * Get all vehicles
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
   * Get vehicle by ID
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
   * Search vehicles by registration number
   * @param {string} registration
   * @returns {Promise<Array>}
   */
  async searchByRegistration(registration) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      try {
        const { data, error } = await supabase
          .from('vehicles')
          .select('id, vehicle_id, registration, vehicle_type, model, status, current_km, engine_number, imei')
          .ilike('registration', `%${registration}%`)

        if (error) throw error
        return data || []
      } catch (error) {
        console.error('Search by registration failed:', error)
        throw error
      }
    }

    return this._searchByRegistrationLocal(registration)
  }

  /**
   * Search vehicles by model
   * @param {string} model
   * @returns {Promise<Array>}
   */
  async searchByModel(model) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      try {
        const { data, error } = await supabase
          .from('vehicles')
          .select('id, vehicle_id, registration, vehicle_type, model, status, current_km, engine_number, imei')
          .ilike('model', `%${model}%`)

        if (error) throw error
        return data || []
      } catch (error) {
        console.error('Search by model failed:', error)
        throw error
      }
    }

    return this._searchByModelLocal(model)
  }

  /**
   * Get vehicles by status
   * @param {string} status
   * @returns {Promise<Array>}
   */
  async getByStatus(status) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      try {
        const { data, error } = await supabase
          .from('vehicles')
          .select('id, vehicle_id, registration, vehicle_type, model, status, current_km, engine_number, imei')
          .eq('status', status)

        if (error) throw error
        return data || []
      } catch (error) {
        console.error('Get by status failed:', error)
        throw error
      }
    }

    return this._getByStatusLocal(status)
  }

  /**
   * Get vehicles assigned to a driver
   * @param {string} driverId
   * @returns {Promise<Array>}
   */
  async getByDriver(driverId) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      return []
    }

    return this._getByDriverLocal(driverId)
  }

  /**
   * Create vehicle
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
   * Update vehicle
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
   * Delete vehicle
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
   * Restore vehicle (undo soft delete)
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async restore(id) {
    return this.update(id, { status: 'active' })
  }

  /**
   * Soft delete vehicle (mark inactive)
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async softDelete(id) {
    return this.update(id, { status: 'inactive' })
  }

  /**
   * Update vehicle status
   * @param {string} id
   * @param {string} status
   * @returns {Promise<Object>}
   */
  async updateStatus(id, status) {
    return this.update(id, { status })
  }

  /**
   * Check registration uniqueness
   * @param {string} registration
   * @param {string} excludeId
   * @returns {Promise<boolean>}
   */
  async isRegistrationUnique(registration, excludeId = null) {
    const vehicles = await this.getAll()
    return !vehicles.some(v => v.registration === registration && v.id !== excludeId)
  }

  /**
   * Check chassis number uniqueness
   * @param {string} chassisNumber
   * @param {string} excludeId
   * @returns {Promise<boolean>}
   */
  async isChassisUnique(chassisNumber, excludeId = null) {
    const vehicles = await this.getAll()
    return !vehicles.some(v => v.chassis_number === chassisNumber && v.id !== excludeId)
  }

  /**
   * Check engine number uniqueness
   * @param {string} engineNumber
   * @param {string} excludeId
   * @returns {Promise<boolean>}
   */
  async isEngineUnique(engineNumber, excludeId = null) {
    const vehicles = await this.getAll()
    return !vehicles.some(v => v.engine_number === engineNumber && v.id !== excludeId)
  }

  // ── LOCAL METHODS ──────────────────────────────────────────────

  _getAllFromLocal() {
    const items = dataService.get(VEHICLES_STORAGE_KEY, [])
    return Promise.resolve(items)
  }

  _getByIdFromLocal(id) {
    const items = dataService.get(VEHICLES_STORAGE_KEY, [])
    const item = items.find(v => v.id === id)
    return Promise.resolve(item || null)
  }

  _createInLocal(data) {
    const items = dataService.get(VEHICLES_STORAGE_KEY, [])
    const vehicle = {
      ...data,
      id: data.id || `VEH-${Date.now().toString().slice(-6)}`,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    items.push(vehicle)
    dataService.set(VEHICLES_STORAGE_KEY, items)
    return Promise.resolve(vehicle)
  }

  _updateInLocal(id, data) {
    const items = dataService.get(VEHICLES_STORAGE_KEY, [])
    const index = items.findIndex(v => v.id === id)
    if (index === -1) {
      return Promise.reject(new Error(`Vehicle ${id} not found`))
    }
    const updated = {
      ...items[index],
      ...data,
      updated_at: new Date().toISOString(),
    }
    items[index] = updated
    dataService.set(VEHICLES_STORAGE_KEY, items)
    return Promise.resolve(updated)
  }

  _deleteFromLocal(id) {
    const items = dataService.get(VEHICLES_STORAGE_KEY, [])
    const filtered = items.filter(v => v.id !== id)
    dataService.set(VEHICLES_STORAGE_KEY, filtered)
    return Promise.resolve(true)
  }

  _searchByRegistrationLocal(registration) {
    const items = dataService.get(VEHICLES_STORAGE_KEY, [])
    const lower = registration.toLowerCase()
    return Promise.resolve(items.filter(v => v.registration?.toLowerCase().includes(lower)))
  }

  _searchByModelLocal(model) {
    const items = dataService.get(VEHICLES_STORAGE_KEY, [])
    const lower = model.toLowerCase()
    return Promise.resolve(items.filter(v => v.model?.toLowerCase().includes(lower)))
  }

  _getByStatusLocal(status) {
    const items = dataService.get(VEHICLES_STORAGE_KEY, [])
    return Promise.resolve(items.filter(v => v.status === status))
  }

  _getByDriverLocal(driverId) {
    const items = dataService.get(VEHICLES_STORAGE_KEY, [])
    return Promise.resolve(items.filter(v => v.current_driver === driverId))
  }

  // ── SUPABASE METHODS ──────────────────────────────────────────

  async _getAllFromSupabase() {
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, vehicle_id, registration, vehicle_type, model, year, color, fuel_type, status, current_km, engine_number, imei, created_at, updated_at')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching vehicles from Supabase:', error)
      throw error
    }
  }

  async _getByIdFromSupabase(id) {
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, vehicle_id, registration, vehicle_type, model, year, color, fuel_type, status, current_km, engine_number, imei, created_at, updated_at')
        .eq(UUID_RE.test(String(id)) ? 'id' : 'vehicle_id', id)
        .single()

      if (error && error.code === 'PGRST116') {
        return null
      }

      if (error) throw error
      return data || null
    } catch (error) {
      console.error('Error fetching vehicle from Supabase:', error)
      throw error
    }
  }

  async _createInSupabase(data) {
    try {
      const vehicle = {
        ...toDbVehicle(data),
        vehicle_id: data.vehicle_id || (!UUID_RE.test(String(data.id || '')) ? data.id : null) || `VEH-${Date.now().toString().slice(-6)}`,
        created_at: data.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { data: created, error } = await supabase
        .from('vehicles')
        .insert([vehicle])
        .select()
        .single()

      if (error) throw error
      cacheClear('vehicles')
      return created
    } catch (error) {
      console.error('Error creating vehicle in Supabase:', error)
      throw error
    }
  }

  async _updateInSupabase(id, data) {
    try {
      const { data: updated, error } = await supabase
        .from('vehicles')
        .update({
          ...toDbVehicle(data),
          updated_at: new Date().toISOString(),
        })
        .eq(UUID_RE.test(String(id)) ? 'id' : 'vehicle_id', id)
        .select()
        .single()

      if (error) throw error
      cacheClear('vehicles')
      return updated
    } catch (error) {
      console.error('Error updating vehicle in Supabase:', error)
      throw error
    }
  }

  async _deleteFromSupabase(id) {
    try {
      const { error } = await supabase
        .from('vehicles')
        .delete()
        .eq(UUID_RE.test(String(id)) ? 'id' : 'vehicle_id', id)

      if (error) throw error
      cacheClear('vehicles')
      return true
    } catch (error) {
      console.error('Error deleting vehicle from Supabase:', error)
      throw error
    }
  }
}

export const vehicleRepository = new VehicleRepository()
export default VehicleRepository
