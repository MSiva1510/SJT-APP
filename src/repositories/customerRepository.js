// ─────────────────────────────────────────────────────────────────────
// CUSTOMER REPOSITORY
// Handles customer data operations with Supabase and localStorage
// ─────────────────────────────────────────────────────────────────────

import { BaseRepository } from './baseRepository'
import supabase from '../lib/supabase'
import { getDatabaseProvider, DATABASE_PROVIDERS } from '../config/database'
import { dataService } from '../services/dataService'

const CUSTOMERS_STORAGE_KEY = 'sjt_customers'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function toDbCustomer(data = {}) {
  const payload = {
    customer_id: data.customer_id || (!UUID_RE.test(String(data.id || '')) ? data.id : undefined),
    name: data.name,
    type: data.type === 'agent' ? 'agency' : data.type,
    status: data.status,
    primary_mobile: data.primary_mobile ?? data.mobile,
    alternate_mobile: data.alternate_mobile ?? data.altMobile,
    email: data.email,
    city: data.city,
    address: data.address ?? data.billingAddress,
    company_name: data.company_name ?? data.companyName,
    contact_person: data.contact_person ?? data.contactPerson,
    gstin: data.gstin ?? data.gst,
    notes: data.notes,
    is_active: data.is_active ?? (data.status ? data.status !== 'inactive' : undefined),
  }
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

/**
 * CustomerRepository - Manages customer data
 */
export class CustomerRepository extends BaseRepository {
  constructor() {
    super('customers', 'id')
  }

  /**
   * Get all customers
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
   * Get customer by ID
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
   * Search customers by mobile number
   * @param {string} mobile
   * @returns {Promise<Array>}
   */
  async searchByMobile(mobile) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .or(`primary_mobile.ilike.%${mobile}%,alternate_mobile.ilike.%${mobile}%`)

        if (error) throw error
        return data || []
      } catch (error) {
        console.error('Search by mobile failed:', error)
        throw error
      }
    }

    return this._searchByMobileLocal(mobile)
  }

  /**
   * Search customers by name
   * @param {string} name
   * @returns {Promise<Array>}
   */
  async searchByName(name) {
    const provider = getDatabaseProvider()

    if (provider === DATABASE_PROVIDERS.SUPABASE) {
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .ilike('name', `%${name}%`)

        if (error) throw error
        return data || []
      } catch (error) {
        console.error('Search by name failed:', error)
        throw error
      }
    }

    return this._searchByNameLocal(name)
  }

  /**
   * Create customer
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
   * Update customer
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
   * Delete customer
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
   * Upsert customer (create or update)
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async upsert(data) {
    const existing = await this.getById(data.id)
    if (existing) {
      return this.update(data.id, data)
    }
    return this.create(data)
  }

  /**
   * Soft delete customer (mark inactive)
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async softDelete(id) {
    return this.update(id, { is_active: false })
  }

  /**
   * Get mobile uniqueness status
   * @param {string} mobile
   * @param {string} excludeId - Customer ID to exclude from check
   * @returns {Promise<boolean>} True if mobile is unique
   */
  async isMobileUnique(mobile, excludeId = null) {
    const customers = await this.getAll()
    return !customers.some(c =>
      (c.primary_mobile === mobile || c.alternate_mobile === mobile) &&
      c.id !== excludeId
    )
  }

  // ── LOCAL METHODS ──────────────────────────────────────────────

  _getAllFromLocal() {
    const items = dataService.get(CUSTOMERS_STORAGE_KEY, [])
    return Promise.resolve(items)
  }

  _getByIdFromLocal(id) {
    const items = dataService.get(CUSTOMERS_STORAGE_KEY, [])
    const item = items.find(c => c.id === id)
    return Promise.resolve(item || null)
  }

  _createInLocal(data) {
    const items = dataService.get(CUSTOMERS_STORAGE_KEY, [])
    const customer = {
      ...data,
      id: data.id || `CUS-${Date.now().toString().slice(-6)}`,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    items.push(customer)
    dataService.set(CUSTOMERS_STORAGE_KEY, items)
    return Promise.resolve(customer)
  }

  _updateInLocal(id, data) {
    const items = dataService.get(CUSTOMERS_STORAGE_KEY, [])
    const index = items.findIndex(c => c.id === id)
    if (index === -1) {
      return Promise.reject(new Error(`Customer ${id} not found`))
    }
    const updated = {
      ...items[index],
      ...data,
      updated_at: new Date().toISOString(),
    }
    items[index] = updated
    dataService.set(CUSTOMERS_STORAGE_KEY, items)
    return Promise.resolve(updated)
  }

  _deleteFromLocal(id) {
    const items = dataService.get(CUSTOMERS_STORAGE_KEY, [])
    const filtered = items.filter(c => c.id !== id)
    dataService.set(CUSTOMERS_STORAGE_KEY, filtered)
    return Promise.resolve(true)
  }

  _searchByMobileLocal(mobile) {
    const items = dataService.get(CUSTOMERS_STORAGE_KEY, [])
    return Promise.resolve(
      items.filter(c =>
        c.primary_mobile?.includes(mobile) ||
        c.alternate_mobile?.includes(mobile)
      )
    )
  }

  _searchByNameLocal(name) {
    const items = dataService.get(CUSTOMERS_STORAGE_KEY, [])
    const lowerName = name.toLowerCase()
    return Promise.resolve(
      items.filter(c => c.name?.toLowerCase().includes(lowerName))
    )
  }

  // ── SUPABASE METHODS ──────────────────────────────────────────

  async _getAllFromSupabase() {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, customer_id, name, type, status, primary_mobile, alternate_mobile, email, city, address, company_name, contact_person, gstin, notes, is_active, created_at, updated_at')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching customers from Supabase:', error)
      throw error
    }
  }

  async _getByIdFromSupabase(id) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, customer_id, name, type, status, primary_mobile, alternate_mobile, email, city, address, company_name, contact_person, gstin, notes, is_active, created_at, updated_at')
        .eq(UUID_RE.test(String(id)) ? 'id' : 'customer_id', id)
        .single()

      if (error && error.code === 'PGRST116') {
        return null
      }

      if (error) throw error
      return data || null
    } catch (error) {
      console.error('Error fetching customer from Supabase:', error)
      throw error
    }
  }

  async _createInSupabase(data) {
    try {
      const customer = {
        ...toDbCustomer(data),
        customer_id: data.customer_id || (!UUID_RE.test(String(data.id || '')) ? data.id : null) || `CUS-${Date.now().toString().slice(-6)}`,
        created_at: data.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { data: created, error } = await supabase
        .from('customers')
        .insert([customer])
        .select()
        .single()

      if (error) throw error
      return created
    } catch (error) {
      console.error('Error creating customer in Supabase:', error)
      throw error
    }
  }

  async _updateInSupabase(id, data) {
    try {
      const { data: updated, error } = await supabase
        .from('customers')
        .update({
          ...toDbCustomer(data),
          updated_at: new Date().toISOString(),
        })
        .eq(UUID_RE.test(String(id)) ? 'id' : 'customer_id', id)
        .select()
        .single()

      if (error) throw error
      return updated
    } catch (error) {
      console.error('Error updating customer in Supabase:', error)
      throw error
    }
  }

  async _deleteFromSupabase(id) {
    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq(UUID_RE.test(String(id)) ? 'id' : 'customer_id', id)

      if (error) throw error
      return true
    } catch (error) {
      console.error('Error deleting customer from Supabase:', error)
      throw error
    }
  }
}

export const customerRepository = new CustomerRepository()
export default CustomerRepository
