// ─── Fleet Alert Repository ─────────────────────────────────────
// Handles fleet alert data operations with Supabase and localStorage
// ─────────────────────────────────────────────────────────────────

import { BaseRepository } from './baseRepository'
import supabase from '../lib/supabase'
import { getDatabaseProvider, DATABASE_PROVIDERS } from '../config/database'
import { dataService } from '../services/dataService'

const ALERTS_STORAGE_KEY = 'sjt_fleet_alerts'
const MISSING_TABLES_STORAGE_KEY = 'sjt_supabase_missing_tables'

function getMissingSupabaseTables() {
  return dataService.get(MISSING_TABLES_STORAGE_KEY, {}) || {}
}

function cacheMissingSupabaseTable(tableName) {
  const tables = getMissingSupabaseTables()
  tables[tableName] = true
  dataService.set(MISSING_TABLES_STORAGE_KEY, tables)
  return true
}

function isSupabaseTableMissing(tableName) {
  return getMissingSupabaseTables()[tableName] === true
}

/**
 * FleetAlertRepository - Manages fleet alert data
 */
export class FleetAlertRepository extends BaseRepository {
  constructor() {
    super('fleet_alerts', 'id')
    this.tableMissing = isSupabaseTableMissing(this.tableName)
  }

  /**
   * Get all alerts with optional filtering
   * @param {Object} opts - Filter options
   * @param {string} opts.vehicleId - Filter by vehicle ID
   * @param {string} opts.driverId - Filter by driver ID
   * @param {string} opts.alertType - Filter by alert type
   * @param {string} opts.priority - Filter by priority
   * @param {string} opts.status - Filter by status
   * @param {string} opts.since - Filter by detection date (ISO string)
   * @param {string} opts.until - Filter by detection date (ISO string)
   * @param {number} opts.limit - Limit results
   * @param {number} opts.offset - Offset for pagination
   * @returns {Promise<Array>}
   */
  async getAll(opts = {}) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE && !this.tableMissing) {
      return this._getAllFromSupabase(opts)
    }

    return this._getAllFromLocal(opts)
  }

  /**
   * Get active alerts (not resolved or closed)
   * @param {Object} opts - Filter options
   * @returns {Promise<Array>}
   */
  async getActiveAlerts(opts = {}) {
    // Add status filter for active alerts
    const optsWithStatus = {
      ...opts,
      status: ['open', 'acknowledged', 'in_progress']
    }
    return this.getAll(optsWithStatus)
  }

  /**
   * Get alert by ID
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getById(id) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE && !this.tableMissing) {
      return this._getByIdFromSupabase(id)
    }

    return this._getByIdFromLocal(id)
  }

  /**
   * Create a new alert
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async create(data) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE && !this.tableMissing) {
      return this._createInSupabase(data)
    }

    return this._createInLocal(data)
  }

  /**
   * Update an alert
   * @param {string} id
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async update(id, data) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE && !this.tableMissing) {
      return this._updateInSupabase(id, data)
    }

    return this._updateInLocal(id, data)
  }

  /**
   * Delete an alert
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE && !this.tableMissing) {
      return this._deleteFromSupabase(id)
    }

    return this._deleteFromLocal(id)
  }

  /**
   * Archive an alert (soft delete or move to archive)
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async archive(id) {
    return this.update(id, { archived: true, archived_at: new Date().toISOString() })
  }

  /**
   * Resolve an alert
   * @param {string} id
   * @param {string} resolvedBy - User ID who resolved the alert
   * @param {string} notes - Resolution notes
   * @returns {Promise<Object>}
   */
  async resolve(id, resolvedBy, notes = '') {
    return this.update(id, {
      status: 'resolved',
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
      ...(notes && { notes })
    })
  }

  /**
   * Acknowledge an alert
   * @param {string} id
   * @param {string} acknowledgedBy - User ID who acknowledged the alert
   * @returns {Promise<Object>}
   */
  async acknowledge(id, acknowledgedBy) {
    return this.update(id, {
      status: 'acknowledged',
      acknowledged_by: acknowledgedBy,
      acknowledged_at: new Date().toISOString()
    })
  }

  // ── LOCAL METHODS ──────────────────────────────────────
  _getAllFromLocal(opts = {}) {
    let items = dataService.get(ALERTS_STORAGE_KEY, [])

    // Apply filters
    if (opts.vehicleId) {
      items = items.filter(a => a.vehicle_id === opts.vehicleId)
    }
    if (opts.driverId) {
      items = items.filter(a => a.driver_id === opts.driverId)
    }
    if (opts.alertType) {
      items = items.filter(a => a.alert_type === opts.alertType)
    }
    if (opts.priority) {
      items = items.filter(a => a.priority === opts.priority)
    }
    if (opts.status) {
      if (Array.isArray(opts.status)) {
        items = items.filter(a => opts.status.includes(a.status))
      } else {
        items = items.filter(a => a.status === opts.status)
      }
    }
    if (opts.since) {
      items = items.filter(a => a.detected_at >= opts.since)
    }
    if (opts.until) {
      items = items.filter(a => a.detected_at <= opts.until)
    }

    // Sort by detected_at descending (newest first)
    items = items.sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at))

    // Apply pagination
    if (opts.offset !== undefined) {
      items = items.slice(opts.offset)
    }
    if (opts.limit !== undefined) {
      items = items.slice(0, opts.limit)
    }

    return Promise.resolve(items)
  }

  _getByIdFromLocal(id) {
    const items = dataService.get(ALERTS_STORAGE_KEY, [])
    const item = items.find(a => a.id === id)
    return Promise.resolve(item || null)
  }

  _createInLocal(data) {
    const items = dataService.get(ALERTS_STORAGE_KEY, [])
    const alert = {
      ...data,
      id: data.id || `alert-${Date.now().toString().slice(-6)}`,
      detected_at: data.detected_at || new Date().toISOString(),
      created_at: data.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    items.push(alert)
    dataService.set(ALERTS_STORAGE_KEY, items)
    return Promise.resolve(alert)
  }

  _updateInLocal(id, data) {
    const items = dataService.get(ALERTS_STORAGE_KEY, [])
    const index = items.findIndex(a => a.id === id)
    if (index === -1) {
      return Promise.reject(new Error(`Alert ${id} not found`))
    }
    const updated = {
      ...items[index],
      ...data,
      updated_at: new Date().toISOString()
    }
    items[index] = updated
    dataService.set(ALERTS_STORAGE_KEY, items)
    return Promise.resolve(updated)
  }

  _deleteFromLocal(id) {
    const items = dataService.get(ALERTS_STORAGE_KEY, [])
    const filtered = items.filter(a => a.id !== id)
    dataService.set(ALERTS_STORAGE_KEY, filtered)
    return Promise.resolve(true)
  }

  // ── SUPABASE METHODS ──────────────────────────────────
  async _getAllFromSupabase(opts = {}) {
    if (!supabase) return []

    let limit = 50
    let offset = 0

    if (opts.limit !== undefined) {
      limit = Math.min(opts.limit, 1000) // Cap at 1000
    }
    if (opts.offset !== undefined) {
      offset = opts.offset
    }

    try {
      let q = supabase
        .from('fleet_alerts')
        .select('*')
        .order('detected_at', { ascending: false })

      // Apply filters
      if (opts.vehicleId) q = q.eq('vehicle_id', opts.vehicleId)
      if (opts.driverId) q = q.eq('driver_id', opts.driverId)
      if (opts.alertType) q = q.eq('alert_type', opts.alertType)
      if (opts.priority) q = q.eq('priority', opts.priority)
      if (opts.status) {
        if (Array.isArray(opts.status)) {
          // For multiple status values, we need to use OR or iterate
          // For simplicity, we'll handle this in post-processing for now
        } else {
          q = q.eq('status', opts.status)
        }
      }
      if (opts.since) q = q.gte('detected_at', opts.since)
      if (opts.until) q = q.lte('detected_at', opts.until)

      // Apply pagination
      q = q.range(offset, offset + limit - 1)

      const { data, error } = await q

      if (error) throw error
      return data || []
    } catch (error) {
      if (error?.code === 'PGRST205' || String(error?.message).includes('fleet_alerts')) {
        this.tableMissing = cacheMissingSupabaseTable(this.tableName)
        console.warn('Fleet alerts table missing in Supabase; falling back to local alerts.')
        return this._getAllFromLocal(opts)
      }
      console.error('Error fetching fleet alerts from Supabase:', error)
      throw error
    }
  }

  async _getByIdFromSupabase(id) {
    if (!supabase) return null

    try {
      const { data, error } = await supabase
        .from('fleet_alerts')
        .select('*')
        .eq('id', id)
        .single()

      if (error && error.code === 'PGRST116') return null
      if (error && error.code === 'PGRST205') {
        this.tableMissing = cacheMissingSupabaseTable(this.tableName)
        return this._getByIdFromLocal(id)
      }
      if (error) throw error
      return data || null
    } catch (error) {
      if (error?.code === 'PGRST205' || String(error?.message).includes('fleet_alerts')) {
        this.tableMissing = cacheMissingSupabaseTable(this.tableName)
        console.warn('Fleet alerts table missing in Supabase; falling back to local alert lookup.')
        return this._getByIdFromLocal(id)
      }
      console.error('Error fetching fleet alert from Supabase:', error)
      throw error
    }
  }

  async _createInSupabase(data) {
    if (!supabase) throw new Error('Supabase not available')

    try {
      const alert = {
        ...data,
        id: data.id || `alert-${Date.now().toString().slice(-6)}`,
        detected_at: data.detected_at || new Date().toISOString(),
        created_at: data.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { data: created, error } = await supabase
        .from('fleet_alerts')
        .insert([alert])
        .select()
        .single()

      if (error) throw error
      return created
    } catch (error) {
      if (error?.code === 'PGRST205' || String(error?.message).includes('fleet_alerts')) {
        this.tableMissing = cacheMissingSupabaseTable(this.tableName)
        console.warn('Fleet alerts table missing in Supabase; creating alert locally.')
        return this._createInLocal(data)
      }
      console.error('Error creating fleet alert in Supabase:', error)
      throw error
    }
  }

  async _updateInSupabase(id, data) {
    if (!supabase) throw new Error('Supabase not available')

    try {
      const update = {
        ...data,
        updated_at: new Date().toISOString()
      }

      const { data: updated, error } = await supabase
        .from('fleet_alerts')
        .update(update)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return updated
    } catch (error) {
      if (error?.code === 'PGRST205' || String(error?.message).includes('fleet_alerts')) {
        this.tableMissing = cacheMissingSupabaseTable(this.tableName)
        console.warn('Fleet alerts table missing in Supabase; updating alert locally.')
        return this._updateInLocal(id, data)
      }
      console.error('Error updating fleet alert in Supabase:', error)
      throw error
    }
  }

  async _deleteFromSupabase(id) {
    if (!supabase) throw new Error('Supabase not available')

    try {
      const { error } = await supabase
        .from('fleet_alerts')
        .delete()
        .eq('id', id)

      if (error) throw error
      return true
    } catch (error) {
      if (error?.code === 'PGRST205' || String(error?.message).includes('fleet_alerts')) {
        this.tableMissing = cacheMissingSupabaseTable(this.tableName)
        console.warn('Fleet alerts table missing in Supabase; deleting alert locally.')
        return this._deleteFromLocal(id)
      }
      console.error('Error deleting fleet alert from Supabase:', error)
      throw error
    }

  }
}

export const fleetAlertRepository = new FleetAlertRepository()
export default FleetAlertRepository