// ─── useCommunication Hook ───────────────────────────────────
// Lightweight per-component hook for sending communications.

import { useCallback }        from 'react'
import { useCommunication as _useCommunicationCtx } from '../context/CommunicationContext'
import {
  notifyBookingCreated, notifyBookingPending,
  notifyBookingApproved, notifyBookingCancelled,
  notifyTripAssigned, notifyTripStarted, notifyTripCompleted,
  notifyExpenseAdded, notifyExpenseApproved,
  notifyPayrollGenerated, notifyInvoiceGenerated,
  notifyDocumentExpiry, notifyAttendanceMissing,
  openWhatsApp, whatsAppLink,
  CHANNELS, EVENTS, publish,
} from '../services/communicationService'
import { WA_TEMPLATES } from '../communication/adapters/WhatsAppAdapter'

export { CHANNELS, EVENTS }

/**
 * Main hook — wraps CommunicationContext.
 * Falls back gracefully when used outside the provider.
 */
export function useCommunicationCtx() {
  try {
    return _useCommunicationCtx()
  } catch {
    return {
      notifications:[], unreadCount:0, notifLoading:false,
      loadNotifs:()=>{}, markRead:()=>{}, markAllRead:()=>{},
      archive:()=>{}, dismiss:()=>{},
      commLogs:[], logsTotal:0, logsLoading:false, loadLogs:()=>{},
      analytics:[], engineStats:{}, loadAnalytics:()=>{},
      preferences:null, prefLoading:false, updatePreferences:()=>{},
      providers:[], scheduledJobs:[],
    }
  }
}

/**
 * WhatsApp-specific hook.
 * Returns helpers that work immediately (deep-link, no API needed).
 */
export function useWhatsApp() {
  const open = useCallback((phone, message) => openWhatsApp(phone, message), [])
  const link = useCallback((phone, message) => whatsAppLink(phone, message), [])

  const sendBookingConfirmation = useCallback((booking) => {
    const msg = WA_TEMPLATES.BOOKING_CONFIRMATION.build(booking).body
    return open(booking.contact, msg)
  }, [open])

  const sendDriverAssigned = useCallback((booking, driver) => {
    const msg = WA_TEMPLATES.DRIVER_ASSIGNED.build({
      bookingNo:    booking.bookingNo,
      driverName:   driver.name,
      driverMobile: driver.mobile,
      vehicleReg:   booking.vehicle,
    }).body
    return open(booking.contact, msg)
  }, [open])

  const sendTripStarted = useCallback((booking) => {
    const msg = WA_TEMPLATES.TRIP_STARTED.build(booking).body
    return open(booking.contact, msg)
  }, [open])

  const sendTripCompleted = useCallback((booking) => {
    const msg = WA_TEMPLATES.TRIP_COMPLETED.build(booking).body
    return open(booking.contact, msg)
  }, [open])

  const sendCancelled = useCallback((booking) => {
    const msg = WA_TEMPLATES.BOOKING_CANCELLED.build(booking).body
    return open(booking.contact, msg)
  }, [open])

  return {
    open, link,
    sendBookingConfirmation,
    sendDriverAssigned,
    sendTripStarted,
    sendTripCompleted,
    sendCancelled,
  }
}

/**
 * Action-focused send helpers for pages.
 */
export function useSend() {
  return {
    booking: {
      created:   notifyBookingCreated,
      pending:   notifyBookingPending,
      approved:  notifyBookingApproved,
      cancelled: notifyBookingCancelled,
    },
    trip: {
      assigned:  notifyTripAssigned,
      started:   notifyTripStarted,
      completed: notifyTripCompleted,
    },
    expense: {
      added:    notifyExpenseAdded,
      approved: notifyExpenseApproved,
    },
    payroll:    { generated: notifyPayrollGenerated },
    invoice:    { generated: notifyInvoiceGenerated },
    document:   { expiry:    notifyDocumentExpiry   },
    attendance: { missing:   notifyAttendanceMissing },
    wa: {
      open: openWhatsApp,
      link: whatsAppLink,
    },
    publish,
  }
}

export default useCommunicationCtx
