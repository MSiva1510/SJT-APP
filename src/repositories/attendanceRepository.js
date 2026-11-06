// ---------------------------------------------------------------------
// ATTENDANCE REPOSITORY (Supabase only)
// Handles driver attendance data
// ---------------------------------------------------------------------

import { BaseRepository } from './baseRepository'
import supabase from '../lib/supabase'

const ATTENDANCE_SELECT = 'id, driver_name, driver_id, attendance_date, status, check_in, check_out, created_at, updated_at'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function toDbAttendance(data = {}) {
  const payload = {
    driver_id: UUID_RE.test(String(data.driver_id || '')) ? data.driver_id : undefined,
    driver_name: data.driver_name ?? data.driver,
    attendance_date: data.attendance_date ?? data.date,
    status: data.status,
    check_in: data.check_in ?? data.checkIn,
    check_out: data.check_out ?? data.checkOut,
  }
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

/**
 * AttendanceRepository - Manages attendance data via Supabase
 */
export class AttendanceRepository extends BaseRepository {
  constructor() {
    super('attendance', 'id')
  }

  async getAll() {
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select(ATTENDANCE_SELECT)
        .order('attendance_date', { ascending: false })
      if (error) throw error
      return data || []
    } catch (error) {
      console.error(error)
      throw error
    }
  }

  async getByDriver(driverId) {
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select(ATTENDANCE_SELECT)
        .eq('driver_id', driverId)
      if (error) throw error
      return data || []
    } catch (error) {
      console.error(error)
      throw error
    }
  }

  async getByDate(date) {
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select(ATTENDANCE_SELECT)
        .eq('attendance_date', date)
      if (error) throw error
      return data || []
    } catch (error) {
      console.error(error)
      throw error
    }
  }

  async getByMonth(month, year) {
    try {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = `${year}-${String(month).padStart(2, '0')}-31`
      const { data, error } = await supabase
        .from('attendance')
        .select(ATTENDANCE_SELECT)
        .gte('attendance_date', startDate)
        .lte('attendance_date', endDate)
      if (error) throw error
      return data || []
    } catch (error) {
      console.error(error)
      throw error
    }
  }

  async create(data) {
    try {
      const record = {
        ...toDbAttendance(data),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const { data: created, error } = await supabase
        .from('attendance')
        .insert([record])
        .select()
        .single()
      if (error) throw error
      return created
    } catch (error) {
      console.error(error)
      throw error
    }
  }

  async update(id, data) {
    try {
      const { data: updated, error } = await supabase
        .from('attendance')
        .update({
          ...toDbAttendance(data),
          updated_at: new Date().toISOString(),
        })
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

  async delete(id) {
    try {
      const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('id', id)
      if (error) throw error
      return true
    } catch (error) {
      console.error(error)
      throw error
    }
  }
}

export const attendanceRepository = new AttendanceRepository()
export default AttendanceRepository
