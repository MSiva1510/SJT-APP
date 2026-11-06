// ─── Customer Data & Storage ──────────────────────────────────
// Storage: Supabase `customers` table via customerRepository

import { customerRepository } from '../repositories/customerRepository'
import { withCache, cacheClear } from '../utils/dataCache'

export const CUSTOMER_TYPES = [
  { key:'individual', label:'Individual',   badge:'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',       dot:'bg-blue-500'   },
  { key:'corporate',  label:'Corporate',    badge:'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300', dot:'bg-violet-500' },
  { key:'agent',      label:'Travel Agent', badge:'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',         dot:'bg-teal-500'   },
]
export const getCustomerTypeCfg = key => CUSTOMER_TYPES.find(t => t.key === key) || CUSTOMER_TYPES[0]

export function generateCustomerId() {
  const ts = Date.now().toString().slice(-6)
  return `CUS-${ts}`
}

// ── Supabase customer store ───────────────────────────────────
// All functions are async — callers must await them.

async function _loadCustomers() {
  try {
    return await customerRepository.getAll()
  } catch (err) {
    console.error('[customerData] loadCustomers failed:', err)
    throw err
  }
}
export const loadCustomers = withCache('customers', _loadCustomers)
export const getCustomers = loadCustomers



export async function saveCustomer(customer) {
  const { id, ...rest } = customer
  const existing = id ? await customerRepository.getById(id) : null
  const result = existing
    ? await customerRepository.update(id, { ...rest, updatedAt: new Date().toISOString() })
    : await customerRepository.create({ id: id || generateCustomerId(), ...rest })
  cacheClear('customers')
  return result
}

export async function deleteCustomer(id) {
  const result = await customerRepository.delete(id)
  cacheClear('customers')
  return result
}

export async function findCustomerByMobile(mobile) {
  if (!mobile || mobile.length < 10) return null
  try {
    const matches = await customerRepository.searchByMobile(mobile)
    return Array.isArray(matches) ? matches[0] || null : matches
  } catch (err) {
    console.error('[customerData] findCustomerByMobile failed:', err)
    return null
  }
}

export async function upsertCustomerFromBooking({ name, mobile, address }) {
  if (!name?.trim()) return null
  try {
    const existing = mobile ? await findCustomerByMobile(mobile) : null
    if (existing) return existing
    const now = new Date().toISOString()
    const customer = {
      id:             generateCustomerId(),
      type:           'individual',
      status:         'active',
      name:           name.trim(),
      mobile:         mobile || '',
      altMobile:      '',
      email:          '',
      address:        address || '',
      city:           '',
      state:          '',
      gst:            '',
      companyName:    '',
      contactPerson:  '',
      billingAddress: '',
      notes:          'Auto-created from booking.',
      createdAt:      now,
      updatedAt:      now,
    }
    return await customerRepository.create(customer)
  } catch (err) {
    console.error('[customerData] upsertCustomerFromBooking failed:', err)
    return null
  }
}

// ── Computed stats (no storage — derived from bookings array) ─
export function getCustomerStats(customerId, customerName, bookings) {
  const mine = bookings.filter(b => b.customer === customerName)
  return {
    totalTrips:     mine.length,
    completedTrips: mine.filter(b => b.status === 'completed').length,
    cancelledTrips: mine.filter(b => b.status === 'cancelled').length,
    activeTrips:    mine.filter(b => ['assigned','started'].includes(b.status)).length,
    totalRevenue:   mine.reduce((s, b) => s + (b.fare || 0), 0),
    lastTrip:       mine.sort((a, b) => (b.createdAt||'').localeCompare(a.createdAt||''))[0] || null,
    upcoming:       mine.filter(b => ['draft','confirmed','assigned'].includes(b.status))
                        .sort((a, b) => (a.startDate||'').localeCompare(b.startDate||'')),
    recent:         mine.filter(b => b.status === 'completed')
                        .sort((a, b) => (b.createdAt||'').localeCompare(a.createdAt||''))
                        .slice(0, 5),
  }
}

// ── Seed / reference data ─────────────────────────────────────
