// ─── Geofence Service ───────────────────────────────────────
// Handles geofence zone detection and event generation
// ────────────────────────────────────────────────────────────

import { geofenceZoneRepository } from '../repositories/geofenceRepository'
import { geofenceEventRepository } from '../repositories/geofenceRepository'
import { vehicleRepository } from '../repositories/vehicleRepository'
import { driverRepository } from '../repositories/driverRepository'
import { dataService } from '../services/dataService'
import { getDatabaseProvider, DATABASE_PROVIDERS } from '../config/database'

const GEOFENCE_STATE_STORAGE_KEY = 'sjt_geofence_state'
const GEOFENCE_DETECTION_RADIUS_MULTIPLIER = 1.1 // 10% buffer for entry/exit detection

/**
 * GeofenceService - Manages geofence zone detection logic
 */
export class GeofenceService {
  constructor() {
    this.zones = []
    this.vehicleStates = new Map() // Track vehicle state per zone: {vehicleId: {zoneId: {inside: boolean, enteredAt: timestamp}}}
    this.initialized = false
  }

  /**
   * Initialize the geofence service by loading zones
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return

    try {
      this.zones = await geofenceZoneRepository.getZones({ activeOnly: true })
      this._loadVehicleStates()
      this.initialized = true
      console.log(`GeofenceService initialized with ${this.zones.length} active zones`)
    } catch (error) {
      const missingTable = error?.code === 'PGRST205' || String(error?.message).includes('geofence_zones')
      if (missingTable) {
        this.zones = []
        this._loadVehicleStates()
        this.initialized = true
        console.warn('GeofenceService initialized with empty zones because geofence_zones table is unavailable.')
        return
      }
      console.error('Failed to initialize GeofenceService:', error)
      throw error
    }
  }

  /**
   * Refresh the zones list from the repository
   * @returns {Promise<void>}
   */
  async refreshZones() {
    this.zones = await geofenceZoneRepository.getZones({ activeOnly: true })
    console.log(`GeofenceService refreshed zones: ${this.zones.length} active zones`)
  }

  /**
   * Check if a point is inside a circular zone
   * @param {number} lat - Latitude of point
   * @param {number} lng - Longitude of point
   * @param {Object} zone - Geofence zone object
   * @returns {boolean} True if point is inside zone
   */
  _isPointInCircleZone(lat, lng, zone) {
    if (!zone.center_lat || !zone.center_lng || !zone.radius_meters) return false

    const R = 6371e3 // Earth's radius in meters
    const φ1 = lat * Math.PI/180
    const φ2 = zone.center_lat * Math.PI/180
    const Δφ = (zone.center_lat - lat) * Math.PI/180
    const Δλ = (zone.center_lng - lng) * Math.PI/180

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    const distance = R * c // Distance in meters

    // Add a small buffer for more reliable detection
    return distance <= (zone.radius_meters * GEOFENCE_DETECTION_RADIUS_MULTIPLIER)
  }

  /**
   * Check if a point is inside a polygonal zone
   * @param {number} lat - Latitude of point
   * @param {number} lng - Longitude of point
   * @param {Object} zone - Geofence zone object
   * @returns {boolean} True if point is inside zone
   */
  _isPointInPolygonZone(lat, lng, zone) {
    if (!zone.coordinates || !Array.isArray(zone.coordinates)) return false

    // Ray casting algorithm for point-in-polygon test
    const points = zone.coordinates
    let inside = false

    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].lng, yi = points[i].lat
      const xj = points[j].lng, yj = points[j].lat

      const intersect = ((yi > lat) !== (yj > lat)) &&
                        (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)

      if (intersect) inside = !inside
    }

    return inside
  }

  /**
   * Check if a point is inside a zone (supports circle and polygon types)
   * @param {number} lat - Latitude of point
   * @param {number} lng - Longitude of point
   * @param {Object} zone - Geofence zone object
   * @returns {boolean} True if point is inside zone
   */
  isPointInZone(lat, lng, zone) {
    switch (zone.type) {
      case 'circle':
        return this._isPointInCircleZone(lat, lng, zone)
      case 'polygon':
        return this._isPointInPolygonZone(lat, lng, zone)
      default:
        // For named location types (office, garage, etc.), treat as circle if coords available
        if (zone.center_lat && zone.center_lng && zone.radius_meters) {
          return this._isPointInCircleZone(lat, lng, zone)
        }
        // Fallback: treat as point location with small radius
        return this._isPointInCircleZone(lat, lng, {
          ...zone,
          radius_meters: zone.radius_meters || 50 // Default 50m radius for named locations
        })
    }
  }

  /**
   * Calculate duration in minutes between two timestamps
   * @param {string} startTime - ISO timestamp string
   * @param {string} endTime - ISO timestamp string
   * @returns {number} Duration in minutes
   */
  _calculateDurationMinutes(startTime, endTime) {
    const start = new Date(startTime)
    const end = new Date(endTime)
    return Math.round((end - start) / (1000 * 60))
  }

  /**
   * Processed for each active fleet, which is used to determine events to generate for a list of
 * @param {Array} vehiclePositions - Array of vehicle position objects
 * @returns {Promise<Array>} Array of generated geofence events
 */
async detectAndGenerateEvents(vehiclePositions) {
    // Ensure the service is initialized
    if (!this.initialized) {
        await this.initialize()
    }

    // If no zones, return empty events array
    if (!this.zones || this.zones.length === 0) {
        return []
    }

    const events = []

    // Process each vehicle position
    for (const position of vehiclePositions) {
        // Skip if no valid position data
        if (!position.latitude || !position.longitude) {
            continue
        }

        // Skip if no vehicle ID found
        if (!position.vehicle_id) {
            continue
        }

        // Get vehicle information (we need this for validation)
        let vehicle = null
        if (position.vehicle_id) {
            vehicle = await vehicleRepository.getById(position.vehicle_id)
        }

        // Skip if no vehicle found
        if (!vehicle) {
            continue
        }

        // Check each zone for entry/exit events
        for (const zone of this.zones) {
            const isInside = this.isPointInZone(
                position.latitude,
                position.longitude,
                zone
            )

            // Get or initialize vehicle state for this zone
            let vehicleState = this.vehicleStates.get(position.vehicle_id)
            if (!vehicleState) {
                vehicleState = {}
                this.vehicleStates.set(position.vehicle_id, vehicleState)
            }

            let zoneState = vehicleState[zone.id]
            if (!zoneState) {
                zoneState = { inside: false, enteredAt: null }
                vehicleState[zone.id] = zoneState
            }

            // Check for zone entry
            if (isInside && !zoneState.inside) {
                // Vehicle just entered the zone
                zoneState.inside = true
                zoneState.enteredAt = position.timestamp || new Date().toISOString()

                // Create entry event
                const entryEvent = await this._createGeofenceEvent({
                    zone_id: zone.id,
                    vehicle_id: position.vehicle_id,
                    driver_id: position.driver_id || null,
                    event_type: 'entry',
                    timestamp: zoneState.enteredAt,
                    entered_at: zoneState.enteredAt
                })
                events.push(entryEvent)
            }

            // Check for zone exit
            if (!isInside && zoneState.inside) {
                // Vehicle just exited the zone
                zoneState.inside = false
                const exitedAt = position.timestamp || new Date().toISOString()

                // Calculate duration
                let durationMinutes = null
                if (zoneState.enteredAt) {
                    durationMinutes = this._calculateDurationMinutes(
                        zoneState.enteredAt,
                        exitedAt
                    )
                }

                // Create exit event
                const exitEvent = await this._createGeofenceEvent({
                    zone_id: zone.id,
                    vehicle_id: position.vehicle_id,
                    driver_id: position.driver_id || null,
                    event_type: 'exit',
                    timestamp: exitedAt,
                    exited_at: exitedAt,
                    duration_minutes: durationMinutes
                })
                events.push(exitEvent)

                // Reset enteredAt for next entry
                zoneState.enteredAt = null
            }
        }
    }

    // Save updated vehicle states
    this._saveVehicleStates()

    return events
}

/**
 * Create a geofence event in the repository
 * @param {Object} eventData - Geofence event data
 * @returns {Promise<Object>} Created event
 */
async _createGeofenceEvent(eventData) {
    try {
        const event = await geofenceEventRepository.create({
            ...eventData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        return event
    } catch (error) {
        console.error('Failed to create geofence event:', error)
        throw error
    }
}

/**
 * Load vehicle states from localStorage (for persistence across sessions)
 * @private
 */
_loadVehicleStates() {
    if (typeof window === 'undefined') return

    try {
        const savedStates = dataService.get(GEOFENCE_STATE_STORAGE_KEY, {})
        this.vehicleStates = new Map(Object.entries(savedStates))
    } catch (error) {
        console.warn('Could not load geofence vehicle states:', error)
        this.vehicleStates = new Map()
    }
}

/**
 * Save vehicle states to localStorage (for persistence across sessions)
 * @private
 */
_saveVehicleStates() {
    if (typeof window === 'undefined') return

    try {
        const statesObj = Object.fromEntries(this.vehicleStates)
        dataService.set(GEOFENCE_STATE_STORAGE_KEY, statesObj)
    } catch (error) {
        console.warn('Could not save geofence vehicle states:', error)
    }
}

/**
 * Get current state of a vehicle in relation to zones
 * @param {string} vehicleId - Vehicle ID
 * @returns {Object} Zone states for the vehicle
 */
getVehicleZoneState(vehicleId) {
    return this.vehicleStates.get(vehicleId) || {}
}

/**
 * Get all zones
 * @returns {Promise<Array>} Array of zone objects
 */
async getZones() {
    if (!this.initialized) {
        await this.initialize()
    }
    return this.zones
}

/**
 * Get a specific zone by ID
 * @param {string} zoneId - Zone ID
 * @returns {Promise<Object|null>} Zone object or null if not found
 */
async getZoneById(zoneId) {
    if (!this.initialized) {
        await this.initialize()
    }
    return await geofenceZoneRepository.getZoneById(zoneId)
}

/**
 * Refresh the zones list from the repository
 * @returns {Promise<void>}
 */
async refreshZones() {
    try {
        this.zones = await geofenceZoneRepository.getZones({ activeOnly: true })
        console.log(`GeofenceService refreshed zones: ${this.zones.length} active zones`)
    } catch (error) {
        console.error('Failed to refresh geofence zones:', error)
        // Keep existing zones if refresh fails
    }
  }

  /**
   * Manually trigger geofence detection for a set of vehicle positions
   * Useful for testing or manual triggering
   * @param {Array} vehiclePositions - Array of vehicle position objects
   * @returns {Promise<Array>} Array of generated geofence events
   */
  async checkPositions(vehiclePositions) {
    return this.detectAndGenerateEvents(vehiclePositions)
  }
}

// Create and export a singleton instance
export const geofenceService = new GeofenceService()

// GeofenceService class is already exported above (export class GeofenceService)