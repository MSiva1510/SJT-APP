// ─── Vehicle Data — Supabase vehicles table ───────────────────
// Provides cached vehicle loading for list and lookup pages.

import { vehicleRepository } from '../repositories/vehicleRepository'
import { withCache } from '../utils/dataCache'

async function _loadVehicles() {
  try {
    return await vehicleRepository.getAll()
  } catch (error) {
    console.error('[vehicleData] loadVehicles failed:', error)
    throw error
  }
}

export const loadVehicles = withCache('vehicles', _loadVehicles)
export const getVehicles = loadVehicles
