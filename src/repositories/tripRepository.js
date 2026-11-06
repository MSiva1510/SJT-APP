// ─────────────────────────────────────────────────────────────────────
// TRIP REPOSITORY
// Handles trip data operations with Supabase and localStorage
// ─────────────────────────────────────────────────────────────────────

import { BaseRepository } from './baseRepository'
import supabase from '../lib/supabase'
import { getDatabaseProvider, DATABASE_PROVIDERS } from '../config/database'
import { dataService } from '../services/dataService'

const TRIPS_STORAGE_KEY = 'sjt_trips'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function toDbBooking(data = {}) {
  const typeData = data.type_data && typeof data.type_data === 'object' ? data.type_data : {}
  const payload = {
    booking_id: data.booking_id ?? data.bookingNo,
    booking_number: data.booking_number ?? data.bookingNo,
    type: data.type,
    status: data.status,
    customer_id: UUID_RE.test(String(data.customer_id || '')) ? data.customer_id : undefined,
    customer_name: data.customer_name ?? data.customer,
    customer_contact: data.customer_contact ?? data.contact,
    driver_id: UUID_RE.test(String(data.driver_id || '')) ? data.driver_id : undefined,
    vehicle_id: UUID_RE.test(String(data.vehicle_id || '')) ? data.vehicle_id : undefined,
    pickup_location: data.pickup_location ?? data.pickup,
    drop_location: data.drop_location ?? data.drop,
    start_date: data.start_date ?? data.startDate,
    start_time: data.start_time ?? data.startTime,
    end_date: data.end_date ?? data.returnDate,
    end_time: data.end_time ?? data.returnTime,
    total_km: data.total_km ?? data.km,
    base_fare: data.base_fare,
    total_fare: data.total_fare ?? data.fare,
    notes: data.notes,
    type_data: { ...typeData, ...data.typeData },
    approved_by: data.approved_by ?? data.approvedBy,
    approved_at: data.approved_at ?? data.approvedAt,
    remarks: data.remarks,
    last_modified_by: data.last_modified_by ?? data.lastModifiedBy,
    approval_history: data.approval_history,
    driver_name: data.driver_name ?? data.driver,
    vehicle_reg: data.vehicle_reg ?? data.vehicle_registration ?? data.vehicle,
  }
  if (!Object.keys(payload.type_data).length) delete payload.type_data
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

/**
 * TripRepository - Manages trip data
 */
export class TripRepository extends BaseRepository {
  constructor() {
    super('bookings', 'id')
  }

  async getAll() {
    const provider = getDatabaseProvider()
    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      return this._getAllFromSupabase()
    }
    return this._getAllFromLocal()
  }

  async getById(id) {
    const provider = getDatabaseProvider()
    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      return this._getByIdFromSupabase(id)
    }
    return this._getByIdFromLocal(id)
  }

  async getByStatus(status) {
    const provider = getDatabaseProvider()
    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      try {
        const { data, error } = await supabase
          .from('bookings')
          .select('id, booking_id, booking_number, type, status, customer_id, customer_name, customer_contact, driver_id, vehicle_id, pickup_location, drop_location, start_date, start_time, end_date, end_time, total_km, base_fare, total_fare, notes, type_data, approved_by, approved_at, remarks, last_modified_by, approval_history, driver_name, vehicle_reg, created_at, updated_at')
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

  async getByDriver(driverId) {
    const provider = getDatabaseProvider()
    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      try {
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('driver_id', driverId)
        if (error) throw error
        return data || []
      } catch (error) {
        console.error('Get by driver failed:', error)
        throw error
      }
    }
    return this._getByDriverLocal(driverId)
  }

  async getByCustomer(customerId) {
    const provider = getDatabaseProvider()
    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      try {
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('customer_id', customerId)
        if (error) throw error
        return data || []
      } catch (error) {
        console.error('Get by customer failed:', error)
        throw error
      }
    }
    return this._getByCustomerLocal(customerId)
  }

  async create(data) {
    const provider = getDatabaseProvider()
    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      return this._createInSupabase(data)
    }
    return this._createInLocal(data)
  }

  async update(id, data) {
    const provider = getDatabaseProvider()
    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      return this._updateInSupabase(id, data)
    }
    return this._updateInLocal(id, data)
  }

  async delete(id) {
    const provider = getDatabaseProvider()
    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      return this._deleteFromSupabase(id)
    }
    return this._deleteFromLocal(id)
  }

  // ── LOCAL METHODS ──────────────────────────────────────────────

  _getAllFromLocal() {
    const items = dataService.get(TRIPS_STORAGE_KEY, [])
    return Promise.resolve(items)
  }

  _getByIdFromLocal(id) {
    const items = dataService.get(TRIPS_STORAGE_KEY, [])
    const item = items.find(t => t.id === id)
    return Promise.resolve(item || null)
  }

  _getByStatusLocal(status) {
    const items = dataService.get(TRIPS_STORAGE_KEY, [])
    return Promise.resolve(items.filter(t => t.status === status))
  }

  _getByDriverLocal(driverId) {
    const items = dataService.get(TRIPS_STORAGE_KEY, [])
    return Promise.resolve(items.filter(t => t.driver_id === driverId))
  }

  _getByCustomerLocal(customerId) {
    const items = dataService.get(TRIPS_STORAGE_KEY, [])
    return Promise.resolve(items.filter(t => t.customer_id === customerId))
  }

  _createInLocal(data) {
    const items = dataService.get(TRIPS_STORAGE_KEY, [])
    const trip = {
      ...data,
      id: data.id || `TRIP-${Date.now().toString().slice(-6)}`,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    items.push(trip)
    dataService.set(TRIPS_STORAGE_KEY, items)
    return Promise.resolve(trip)
  }

  _updateInLocal(id, data) {
    const items = dataService.get(TRIPS_STORAGE_KEY, [])
    const index = items.findIndex(t => t.id === id)
    if (index === -1) {
      return Promise.reject(new Error(`Trip ${id} not found`))
    }
    const updated = {
      ...items[index],
      ...data,
      updated_at: new Date().toISOString(),
    }
    items[index] = updated
    dataService.set(TRIPS_STORAGE_KEY, items)
    return Promise.resolve(updated)
  }

  _deleteFromLocal(id) {
    const items = dataService.get(TRIPS_STORAGE_KEY, [])
    const filtered = items.filter(t => t.id !== id)
    dataService.set(TRIPS_STORAGE_KEY, filtered)
    return Promise.resolve(true)
  }

  // ── SUPABASE METHODS ──────────────────────────────────────────

  async _getAllFromSupabase() {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_id, booking_number, type, status, customer_id, customer_name, customer_contact, driver_id, vehicle_id, pickup_location, drop_location, start_date, start_time, end_date, end_time, total_km, base_fare, total_fare, notes, type_data, approved_by, approved_at, remarks, last_modified_by, approval_history, driver_name, vehicle_reg, created_at, updated_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching trips from Supabase:', error)
      throw error
    }
  }

  async _getByIdFromSupabase(id) {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_id, booking_number, type, status, customer_id, customer_name, customer_contact, driver_id, vehicle_id, pickup_location, drop_location, start_date, start_time, end_date, end_time, total_km, base_fare, total_fare, notes, type_data, approved_by, approved_at, remarks, last_modified_by, approval_history, driver_name, vehicle_reg, created_at, updated_at')
        .eq(UUID_RE.test(String(id)) ? 'id' : 'booking_id', id)
        .single()
      if (error && error.code === 'PGRST116') {
        return null
      }
      if (error) throw error
      return data || null
    } catch (error) {
      console.error('Error fetching trip from Supabase:', error)
      throw error
    }
  }

  async _createInSupabase(data) {
    try {
      // Never pass a non-UUID 'id' — let Supabase auto-generate the PK.
      // booking_number and booking_id carry the human-readable reference.
      const { id, ...payload } = data
      const trip = {
        ...toDbBooking(payload),
        ...(UUID_RE.test(String(id || '')) ? { id } : {}),
        booking_id: payload.booking_id || payload.bookingNo || (!UUID_RE.test(String(id || '')) ? id : null) || `BK-${Date.now().toString().slice(-6)}`,
        booking_number: payload.booking_number || payload.bookingNo || payload.booking_id || `BK-${Date.now().toString().slice(-6)}`,
        created_at: payload.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const { data: created, error } = await supabase
        .from('bookings')
        .insert([trip])
        .select()
        .single()
      if (error) throw error
      return created
    } catch (error) {
      console.error('Error creating trip in Supabase:', error)
      throw error
    }
  }

  async _updateInSupabase(id, data) {
    try {
      const { data: updated, error } = await supabase
        .from('bookings')
        .update({
          ...toDbBooking(data),
          updated_at: new Date().toISOString(),
        })
        .eq(UUID_RE.test(String(id)) ? 'id' : 'booking_id', id)
        .select()
        .single()
      if (error) throw error
      return updated
    } catch (error) {
      console.error('Error updating trip in Supabase:', error)
      throw error
    }
  }

  async _deleteFromSupabase(id) {
    try {
      const { error } = await supabase
        .from('bookings')
        .delete()
        .eq(UUID_RE.test(String(id)) ? 'id' : 'booking_id', id)
      if (error) throw error
      return true
    } catch (error) {
      console.error('Error deleting trip from Supabase:', error)
      throw error
    }
  }
}

export const tripRepository = new TripRepository()
export default TripRepository
