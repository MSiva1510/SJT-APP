// ─── Geofence Repository ───────────────────────────────────────
// Handles geofence zone data operations with Supabase and localStorage
// ────────────────────────────────────────────────────────────────

import { BaseRepository } from './baseRepository'
import supabase from '../lib/supabase'
import { getDatabaseProvider, DATABASE_PROVIDERS } from '../config/database'
import { dataService } from '../services/dataService'

const GEOFENCE_ZONES_STORAGE_KEY = 'sjt_geofence_zones'
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
 * GeofenceZoneRepository - Manages geofence zone data
 */
export class GeofenceZoneRepository extends BaseRepository {
  constructor() {
    super('geofence_zones', 'id')
    this.tableMissing = isSupabaseTableMissing(this.tableName)
  }

  /**
   * Get all geofence zones with optional filtering
   * @param {Object} opts - Filter options
   * @param {string} opts.type - Filter by zone type (circle, polygon, etc.)
   * @param {string} opts.name - Filter by name (partial match)
   * @param {boolean} opts.activeOnly - Filter by active status
   * @returns {Promise<Array>}
   */
  async getZones(opts = {}) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE && !this.tableMissing) {
      return this._getZonesFromSupabase(opts)
    }

    return this._getZonesFromLocal(opts)
  }

  /**
   * Get geofence zone by ID
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getZoneById(id) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE && !this.tableMissing) {
      return this._getZoneByIdFromSupabase(id)
    }

    return this._getZoneByIdFromLocal(id)
  }

  /**
   * Create a new geofence zone
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async createZone(data) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE && !this.tableMissing) {
      return this._createZoneInSupabase(data)
    }

    return this._createZoneInLocal(data)
  }

  /**
   * Update a geofence zone
   * @param {string} id
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async updateZone(id, data) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE && !this.tableMissing) {
      return this._updateZoneInSupabase(id, data)
    }

    return this._updateZoneInLocal(id, data)
  }

  /**
   * Delete a geofence zone
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async deleteZone(id) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE && !this.tableMissing) {
      return this._deleteZoneFromSupabase(id)
    }

    return this._deleteZoneFromLocal(id)
  }

  // ── LOCAL METHODS ──────────────────────────────────────
  _getZonesFromLocal(opts = {}) {
    let items = dataService.get(GEOFENCE_ZONES_STORAGE_KEY, [])

    // Apply filters
    if (opts.type) {
      items = items.filter(z => z.type === opts.type)
    }
    if (opts.name) {
      const searchTerm = opts.name.toLowerCase()
      items = items.filter(z => z.name?.toLowerCase().includes(searchTerm))
    }
    if (opts.activeOnly !== undefined) {
      items = items.filter(z => z.is_active === opts.activeOnly)
    }

    // Sort by name ascending
    items = items.sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    )

    return Promise.resolve(items)
  }

  _getZoneByIdFromLocal(id) {
    const items = dataService.get(GEOFENCE_ZONES_STORAGE_KEY, [])
    const item = items.find(z => z.id === id)
    return Promise.resolve(item || null)
  }

  _createZoneInLocal(data) {
    const items = dataService.get(GEOFENCE_ZONES_STORAGE_KEY, [])
    const zone = {
      ...data,
      id: data.id || `zone-${Date.now().toString().slice(-6)}`,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    items.push(zone)
    dataService.set(GEOFENCE_ZONES_STORAGE_KEY, items)
    return Promise.resolve(zone)
  }

  _updateZoneInLocal(id, data) {
    const items = dataService.get(GEOFENCE_ZONES_STORAGE_KEY, [])
    const index = items.findIndex(z => z.id === id)
    if (index === -1) {
      return Promise.reject(new Error(`Geofence zone ${id} not found`))
    }
    const updated = {
      ...items[index],
      ...data,
      updated_at: new Date().toISOString()
    }
    items[index] = updated
    dataService.set(GEOFENCE_ZONES_STORAGE_KEY, items)
    return Promise.resolve(updated)
  }

  _deleteZoneFromLocal(id) {
    const items = dataService.get(GEOFENCE_ZONES_STORAGE_KEY, [])
    const filtered = items.filter(z => z.id !== id)
    dataService.set(GEOFENCE_ZONES_STORAGE_KEY, filtered)
    return Promise.resolve(true)
  }

  // ── SUPABASE METHODS ──────────────────────────────────
  async _getZonesFromSupabase(opts = {}) {
    if (!supabase) return []

    try {
      let q = supabase
        .from('geofence_zones')
        .select('*')
        .order('name', { ascending: true })

      // Apply filters
      if (opts.type) q = q.eq('type', opts.type)
      if (opts.name) q = q.ilike('name', `%${opts.name}%`)
      if (opts.activeOnly !== undefined) q = q.eq('is_active', opts.activeOnly)

      const { data, error } = await q

      if (error) throw error
      return data || []
    } catch (error) {
      if (error?.code === 'PGRST205' || String(error?.message).includes('geofence_zones')) {
        this.tableMissing = cacheMissingSupabaseTable(this.tableName)
        console.warn('Geofence table missing in Supabase; falling back to empty local geofence list.')
        return []
      }
      console.error('Error fetching geofence zones from Supabase:', error)
      throw error
    }
  }

  async _getZoneByIdFromSupabase(id) {
    if (!supabase) return null

    try {
      const { data, error } = await supabase
        .from('geofence_zones')
        .select('*')
        .eq('id', id)
        .single()

      if (error && error.code === 'PGRST116') return null
      if (error && error.code === 'PGRST205') {
        this.tableMissing = cacheMissingSupabaseTable(this.tableName)
        return null
      }
      if (error) throw error
      return data || null
    } catch (error) {
      if (error?.code === 'PGRST205' || String(error?.message).includes('geofence_zones')) {
        this.tableMissing = cacheMissingSupabaseTable(this.tableName)
        console.warn('Geofence table missing in Supabase; returning null for zone lookup.')
        return null
      }
      console.error('Error fetching geofence zone from Supabase:', error)
      throw error
    }
  }

  async _createZoneInSupabase(data) {
    if (!supabase) throw new Error('Supabase not available')

    try {
      const zone = {
        ...data,
        id: data.id || crypto.randomUUID(),
        created_at: data.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { data: created, error } = await supabase
        .from('geofence_zones')
        .insert([zone])
        .select()
        .single()

      if (error) throw error
      return created
    } catch (error) {
      if (error?.code === 'PGRST205' || String(error?.message).includes('geofence_zones')) {
        this.tableMissing = cacheMissingSupabaseTable(this.tableName)
        console.warn('Geofence table missing in Supabase; creating zone locally.')
        return this._createZoneInLocal(data)
      }
      console.error('Error creating geofence zone in Supabase:', error)
      throw error
    }
  }

  async _updateZoneInSupabase(id, data) {
    if (!supabase) throw new Error('Supabase not available')

    try {
      const update = {
        ...data,
        updated_at: new Date().toISOString()
      }

      const { data: updated, error } = await supabase
        .from('geofence_zones')
        .update(update)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return updated
    } catch (error) {
      if (error?.code === 'PGRST205' || String(error?.message).includes('geofence_zones')) {
        this.tableMissing = cacheMissingSupabaseTable(this.tableName)
        console.warn('Geofence table missing in Supabase; updating zone locally.')
        return this._updateZoneInLocal(id, data)
      }
      console.error('Error updating geofence zone in Supabase:', error)
      throw error
    }
  }

  async _deleteZoneFromSupabase(id) {
    if (!supabase) throw new Error('Supabase not available')

    try {
      const { error } = await supabase
        .from('geofence_zones')
        .delete()
        .eq('id', id)

      if (error) throw error
      return true
    } catch (error) {
      if (error?.code === 'PGRST205' || String(error?.message).includes('geofence_zones')) {
        this.tableMissing = cacheMissingSupabaseTable(this.tableName)
        console.warn('Geofence table missing in Supabase; deleting zone locally.')
        return this._deleteZoneFromLocal(id)
      }
      console.error('Error deleting geofence zone from Supabase:', error)
      throw error
    }
  }
}

// Create a separate repository for geofence events
export class GeofenceEventRepository extends BaseRepository {
  constructor() {
    super('geofence_events', 'id')
  }

  /**
   * Get geofence events with optional filtering
   * @param {Object} opts - Filter options
   * @param {string} opts.zoneId - Filter by zone ID
   * @param {string} opts.vehicleId - Filter by vehicle ID
   * @param {string} opts.driverId - Filter by driver ID
   * @param {string} opts.eventType - Filter by event type (entry/exit)
   * @param {string} opts.since - Filter by timestamp (ISO string)
   * @param {string} opts.until - Filter by timestamp (ISO string)
   * @param {number} opts.limit - Limit results
   * @param {number} opts.offset - Offset for pagination
   * @returns {Promise<Array>}
   */
  async getEvents(opts = {}) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      return this._getEventsFromSupabase(opts)
    }

    return this._getEventsFromLocal(opts)
  }

  // ── LOCAL METHODS ──────────────────────────────────────
  _getEventsFromLocal(opts = {}) {
    let items = dataService.get('sjt_geofence_events', [])

    // Apply filters
    if (opts.zoneId) {
      items = items.filter(e => e.zone_id === opts.zoneId)
    }
    if (opts.vehicleId) {
      items = items.filter(e => e.vehicle_id === opts.vehicleId)
    }
    if (opts.driverId) {
      items = items.filter(e => e.driver_id === opts.driverId)
    }
    if (opts.eventType) {
      items = items.filter(e => e.event_type === opts.eventType)
    }
    if (opts.since) {
      items = items.filter(e => e.timestamp >= opts.since)
    }
    if (opts.until) {
      items = items.filter(e => e.timestamp <= opts.until)
    }

    // Sort by timestamp descending (newest first)
    items = items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

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
    const items = dataService.get('sjt_geofence_events', [])
    const item = items.find(e => e.id === id)
    return Promise.resolve(item || null)
  }

  _createInLocal(data) {
    const items = dataService.get('sjt_geofence_events', [])
    const event = {
      ...data,
      id: data.id || `event-${Date.now().toString().slice(-6)}`,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    items.push(event)
    dataService.set('sjt_geofence_events', items)
    return Promise.resolve(event)
  }

  _updateInLocal(id, data) {
    const items = dataService.get('sjt_geofence_events', [])
    const index = items.findIndex(e => e.id === id)
    if (index === -1) {
      return Promise.reject(new Error(`Geofence event ${id} not found`))
    }
    const updated = {
      ...items[index],
      ...data,
      updated_at: new Date().toISOString()
    }
    items[index] = updated
    dataService.set('sjt_geofence_events', items)
    return Promise.resolve(updated)
  }

  _deleteFromLocal(id) {
    const items = dataService.get('sjt_geofence_events', [])
    const filtered = items.filter(e => e.id !== id)
    dataService.set('sjt_geofence_events', filtered)
    return Promise.resolve(true)
  }

  // ── SUPABASE METHODS ──────────────────────────────────
  async _getEventsFromSupabase(opts = {}) {
    if (!supabase) return []

    try {
      let q = supabase
        .from('geofence_events')
        .select('*')
        .order('timestamp', { ascending: false })

      // Apply filters
      if (opts.zoneId) q = q.eq('zone_id', opts.zoneId)
      if (opts.vehicleId) q = q.eq('vehicle_id', opts.vehicleId)
      if (opts.driverId) q = q.eq('driver_id', opts.driverId)
      if (opts.eventType) q = q.eq('event_type', opts.eventType)
      if (opts.since) q = q.gte('timestamp', opts.since)
      if (opts.until) q = q.lte('timestamp', opts.until)

      // Apply pagination
      if (opts.limit !== undefined) {
        const limit = Math.min(opts.limit, 1000)
        const offset = opts.offset !== undefined ? opts.offset : 0
        q = q.range(offset, offset + limit - 1)
      }

      const { data, error } = await q

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching geofence events from Supabase:', error)
      throw error
    }
  }

  async _createInSupabase(data) {
    if (!supabase) throw new Error('Supabase not available')

    try {
      const event = {
        ...data,
        id: data.id || crypto.randomUUID(),
        created_at: data.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { data: created, error } = await supabase
        .from('geofence_events')
        .insert([event])
        .select()
        .single()

      if (error) throw error
      return created
    } catch (error) {
      console.error('Error creating geofence event in Supabase:', error)
      throw error
    }
  }
}

// Export instances
export const geofenceZoneRepository = new GeofenceZoneRepository()
export const geofenceEventRepository = new GeofenceEventRepository()
// Classes are already exported above