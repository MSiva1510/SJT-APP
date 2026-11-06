// ─────────────────────────────────────────────────────────────────────
// EXPENSE REPOSITORY
// Handles expense data management
// ─────────────────────────────────────────────────────────────────────

import { BaseRepository } from './baseRepository'
import supabase from '../lib/supabase'
import { getDatabaseProvider, DATABASE_PROVIDERS } from '../config/database'
import { dataService } from '../services/dataService'

const EXPENSES_STORAGE_KEY = 'sjt_expenses'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXPENSE_SELECT = 'id, booking_id, driver_id, driver_name, amount, expense_date, description, created_by, status, type, odometer_km, litres_filled, fuel_station, fuel_rate, created_at, updated_at'

function toDbExpense(data = {}) {
  const payload = {
    booking_id: UUID_RE.test(String(data.booking_id || data.tripRef || '')) ? (data.booking_id || data.tripRef) : undefined,
    driver_id: UUID_RE.test(String(data.driver_id || '')) ? data.driver_id : undefined,
    driver_name: data.driver_name ?? data.driver,
    amount: data.amount,
    expense_date: data.expense_date ?? data.date ?? data.receiptDate,
    description: data.description ?? data.notes ?? data.location,
    created_by: UUID_RE.test(String(data.created_by || '')) ? data.created_by : undefined,
    status: data.status,
    type: data.type === 'misc' ? 'other' : data.type,
    odometer_km: data.odometerKm,
    litres_filled: data.litresFilled,
    fuel_station: data.fuelStation,
    fuel_rate: data.fuelRate,
  }
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

/**
 * ExpenseRepository - Manages expense data
 */
export class ExpenseRepository extends BaseRepository {
  constructor() {
    super('expenses', 'id')
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

  async getByDriver(driverId) {
    const provider = getDatabaseProvider()
    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      try {
        const { data, error } = await supabase
          .from('expenses')
          .select(EXPENSE_SELECT)
          .eq('driver_id', driverId)
        if (error) throw error
        return data || []
      } catch (error) {
        console.error(error)
        throw error
      }
    }
    return this._getByDriverLocal(driverId)
  }

  async getByTrip(tripId) {
    const provider = getDatabaseProvider()
    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      try {
        const { data, error } = await supabase
          .from('expenses')
          .select(EXPENSE_SELECT)
          .eq('booking_id', tripId)
        if (error) throw error
        return data || []
      } catch (error) {
        console.error(error)
        throw error
      }
    }
    return this._getByTripLocal(tripId)
  }

  async getByStatus(status) {
    const provider = getDatabaseProvider()
    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      try {
        const { data, error } = await supabase
          .from('expenses')
          .select(EXPENSE_SELECT)
          .eq('status', status)
        if (error) throw error
        return data || []
      } catch (error) {
        console.error(error)
        throw error
      }
    }
    return this._getByStatusLocal(status)
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
    return Promise.resolve(dataService.get(EXPENSES_STORAGE_KEY, []))
  }

  _getByIdFromLocal(id) {
    const items = dataService.get(EXPENSES_STORAGE_KEY, [])
    return Promise.resolve(items.find(e => e.id === id) || null)
  }

  _getByDriverLocal(driverId) {
    const items = dataService.get(EXPENSES_STORAGE_KEY, [])
    return Promise.resolve(items.filter(e => e.driver_id === driverId))
  }

  _getByTripLocal(tripId) {
    const items = dataService.get(EXPENSES_STORAGE_KEY, [])
    return Promise.resolve(items.filter(e => e.booking_id === tripId))
  }

  _getByStatusLocal(status) {
    const items = dataService.get(EXPENSES_STORAGE_KEY, [])
    return Promise.resolve(items.filter(e => e.status === status))
  }

  _createInLocal(data) {
    const items = dataService.get(EXPENSES_STORAGE_KEY, [])
    const expense = {
      ...data,
      id: data.id || `EXP-${Date.now().toString().slice(-6)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    items.push(expense)
    dataService.set(EXPENSES_STORAGE_KEY, items)
    return Promise.resolve(expense)
  }

  _updateInLocal(id, data) {
    const items = dataService.get(EXPENSES_STORAGE_KEY, [])
    const index = items.findIndex(e => e.id === id)
    if (index === -1) return Promise.reject(new Error('Not found'))
    const updated = { ...items[index], ...data, updated_at: new Date().toISOString() }
    items[index] = updated
    dataService.set(EXPENSES_STORAGE_KEY, items)
    return Promise.resolve(updated)
  }

  _deleteFromLocal(id) {
    const items = dataService.get(EXPENSES_STORAGE_KEY, [])
    dataService.set(EXPENSES_STORAGE_KEY, items.filter(e => e.id !== id))
    return Promise.resolve(true)
  }

  // ── SUPABASE METHODS ──────────────────────────────────────────

  async _getAllFromSupabase() {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select(EXPENSE_SELECT)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    } catch (error) {
      console.error(error)
      throw error
    }
  }

  async _getByIdFromSupabase(id) {
    if (!UUID_RE.test(String(id))) return null
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select(EXPENSE_SELECT)
        .eq('id', id)
        .single()
      if (error && error.code === 'PGRST116') return null
      if (error) throw error
      return data || null
    } catch (error) {
      console.error(error)
      throw error
    }
  }

  async _createInSupabase(data) {
    try {
      const expense = {
        ...toDbExpense(data),
        ...(UUID_RE.test(String(data.id || '')) ? { id: data.id } : {}),
        created_at: data.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const { data: created, error } = await supabase
        .from('expenses')
        .insert([expense])
        .select()
        .single()
      if (error) throw error
      return created
    } catch (error) {
      console.error(error)
      throw error
    }
  }

  async _updateInSupabase(id, data) {
    if (!UUID_RE.test(String(id))) {
      throw new Error(`Cannot update expense ${id}: Supabase expense id must be a UUID`)
    }
    try {
      const { data: updated, error } = await supabase
        .from('expenses')
        .update({ ...toDbExpense(data), updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return updated
    } catch (error) {
      console.error(error)
      throw error
    }
  }

  async _deleteFromSupabase(id) {
    if (!UUID_RE.test(String(id))) {
      throw new Error(`Cannot delete expense ${id}: Supabase expense id must be a UUID`)
    }
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id)
      if (error) throw error
      return true
    } catch (error) {
      console.error(error)
      throw error
    }
  }
}

export const expenseRepository = new ExpenseRepository()
export default ExpenseRepository
