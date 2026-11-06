// ─────────────────────────────────────────────────────────────────────────────
// manager_provider.dart — Riverpod state for the manager mode (admin /
// manager accounts): dashboard, alerts, trips, fleet, expenses, attendance,
// documents, vehicles, drivers, customers, invoices, WhatsApp inbox.
//
// Every read is a plain FutureProvider over ManagerRepository; screens
// invalidate the affected providers after a write. All of them are
// invalidated on logout from `_teardownSession` in main.dart.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/manager_directory.dart';
import '../models/manager_invoice.dart';
import '../models/manager_models.dart';
import '../models/manager_report.dart';
import '../models/manager_whatsapp.dart';
import '../repositories/manager_repository.dart';
import '../services/expected_route_service.dart';
import '../services/fleet_gps_sync.dart';
import 'route_map_provider.dart' show expectedRouteServiceProvider;
import 'auth_provider.dart';

final managerRepositoryProvider = Provider<ManagerRepository>((ref) {
  return ManagerRepository(ref.watch(supabaseClientProvider));
});

/// Who is acting — written to bookings.last_modified_by / approval_history
/// and expenses.approved_by, same as the web ERP (actor NAME, not id).
typedef ManagerActor = ({String name, String role});

final managerActorProvider = Provider<ManagerActor>((ref) {
  final p = ref.watch(currentProfileProvider);
  final name = (p?.fullName.trim().isNotEmpty ?? false)
      ? p!.fullName.trim()
      : (p?.email ?? 'Manager');
  return (name: name, role: p?.role ?? 'manager');
});

// ── Dashboard ────────────────────────────────────────────────────────────────

final managerDashboardProvider = FutureProvider.autoDispose<ManagerDashboard>((
  ref,
) {
  return ref.watch(managerRepositoryProvider).dashboard();
});

final managerReportProvider = FutureProvider.autoDispose
    .family<ManagerReport, ManagerReportPeriod>((ref, period) {
      return ref.watch(managerRepositoryProvider).reportForPeriod(period);
    });

final managerAlertsProvider = FutureProvider.autoDispose<List<FleetAlert>>((
  ref,
) {
  return ref.watch(managerRepositoryProvider).activeAlerts();
});

// ── Trips ────────────────────────────────────────────────────────────────────

final managerBookingsProvider =
    FutureProvider.autoDispose<List<ManagerBooking>>((ref) {
      return ref.watch(managerRepositoryProvider).bookings();
    });

final managerBookingProvider = FutureProvider.autoDispose
    .family<ManagerBooking, String>((ref, id) {
      return ref.watch(managerRepositoryProvider).booking(id);
    });

enum ManagerTripFilter {
  all,
  today,
  upcoming,
  unassigned,
  pending,
  active,
  completed,
}

extension ManagerTripFilterX on ManagerTripFilter {
  String get label => switch (this) {
    ManagerTripFilter.all => 'All',
    ManagerTripFilter.today => 'Today',
    ManagerTripFilter.upcoming => 'Upcoming',
    ManagerTripFilter.unassigned => 'Unassigned',
    ManagerTripFilter.pending => 'Pending',
    ManagerTripFilter.active => 'Active',
    ManagerTripFilter.completed => 'Completed',
  };

  bool matches(ManagerBooking b, DateTime now) {
    final today = DateTime(now.year, now.month, now.day);
    final d = b.startDate == null
        ? null
        : DateTime(b.startDate!.year, b.startDate!.month, b.startDate!.day);
    return switch (this) {
      ManagerTripFilter.all => true,
      ManagerTripFilter.today => d == today,
      ManagerTripFilter.upcoming => d != null && !d.isBefore(today) && b.isOpen,
      ManagerTripFilter.unassigned =>
        b.isOpen && !b.isAssigned && b.status != 'started',
      ManagerTripFilter.pending => b.status == 'pending',
      ManagerTripFilter.active => b.status == 'started',
      ManagerTripFilter.completed =>
        b.status == 'completed' || b.status == 'closed',
    };
  }
}

/// Selected chip on the Trips tab — Home KPI tiles set it before switching.
final managerTripFilterProvider = StateProvider<ManagerTripFilter>(
  (ref) => ManagerTripFilter.all,
);

final managerDriversProvider = FutureProvider.autoDispose<List<DriverOption>>((
  ref,
) {
  return ref.watch(managerRepositoryProvider).drivers();
});

final managerVehiclesProvider = FutureProvider.autoDispose<List<VehicleOption>>(
  (ref) {
    return ref.watch(managerRepositoryProvider).vehicles();
  },
);

/// Recorded GPS route of one booking (see ManagerRepository.tripTrack).
final managerTripTrackProvider = FutureProvider.autoDispose
    .family<TripTrack, String>((ref, id) async {
      final b = await ref.watch(managerBookingProvider(id).future);
      return ref.read(managerRepositoryProvider).tripTrack(b);
    });

/// Planned pickup → drop road route (null when a place can't be found).
final managerPlannedRouteProvider = FutureProvider.autoDispose
    .family<ExpectedRoute?, String>((ref, id) async {
      final b = await ref.watch(managerBookingProvider(id).future);
      try {
        return await ref
            .read(expectedRouteServiceProvider)
            .resolve(pickup: b.pickup, drop: b.drop);
      } catch (_) {
        return null;
      }
    });

// ── Fleet ────────────────────────────────────────────────────────────────────

final fleetGpsSyncProvider = Provider<FleetGpsSync>(
  (ref) => FleetGpsSync(ref.watch(supabaseClientProvider)),
);

/// Outcome of the last vendor pull (null until the first one finishes).
final fleetSyncResultProvider = StateProvider<FleetSyncResult?>((ref) => null);

/// Pulls the vendor feeds first, so the map is live even when nobody has the
/// web dashboard open; a failed pull still shows the stored positions.
final managerFleetProvider = FutureProvider.autoDispose<List<VehiclePosition>>((
  ref,
) async {
  try {
    final sync = await ref.read(fleetGpsSyncProvider).syncOnce();
    if (sync.written > 0 || sync.errors.isNotEmpty) {
      ref.read(fleetSyncResultProvider.notifier).state = sync;
    }
  } catch (_) {
    // No client (tests / demo) — show what is stored.
  }
  return ref.read(managerRepositoryProvider).fleetPositions();
});

final managerVehicleBookingsProvider = FutureProvider.autoDispose
    .family<List<ManagerBooking>, String>((ref, vehicleId) {
      return ref.watch(managerRepositoryProvider).vehicleBookings(vehicleId);
    });

// ── Expenses ─────────────────────────────────────────────────────────────────

final managerPendingExpensesProvider =
    FutureProvider.autoDispose<List<PendingExpense>>((ref) {
      return ref.watch(managerRepositoryProvider).expenses();
    });

// ── Attendance ───────────────────────────────────────────────────────────────

/// Keyed by the calendar day (time stripped) so equal dates share a cache.
final managerAttendanceProvider = FutureProvider.autoDispose
    .family<List<AttendanceEntry>, DateTime>((ref, day) {
      return ref
          .watch(managerRepositoryProvider)
          .attendanceFor(DateTime(day.year, day.month, day.day));
    });

final managerAttendanceTripsProvider = FutureProvider.autoDispose
    .family<List<ManagerBooking>, DateTime>((ref, month) {
      return ref
          .watch(managerRepositoryProvider)
          .attendanceTripsForMonth(DateTime(month.year, month.month));
    });

// ── Directory (Documents · Vehicles · Drivers · Customers) ─────────────────

final managerExpiringDocsProvider =
    FutureProvider.autoDispose<List<ExpiryItem>>(
      (ref) => ref.watch(managerRepositoryProvider).expiringDocuments(),
    );

final managerVehicleRecordsProvider =
    FutureProvider.autoDispose<List<VehicleRecord>>(
      (ref) => ref.watch(managerRepositoryProvider).vehicleRecords(),
    );

final managerDriverRecordsProvider =
    FutureProvider.autoDispose<List<DriverRecord>>(
      (ref) => ref.watch(managerRepositoryProvider).driverRecords(),
    );

final managerCustomerRecordsProvider =
    FutureProvider.autoDispose<List<CustomerRecord>>(
      (ref) => ref.watch(managerRepositoryProvider).customerRecords(),
    );

final managerDocumentRecordsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
      (ref) => ref.watch(managerRepositoryProvider).documentRecords(),
    );

/// Completed / closed trips shown as invoices.
final managerInvoicesProvider = FutureProvider.autoDispose<List<InvoiceRecord>>(
  (ref) => ref.watch(managerRepositoryProvider).invoices(),
);

/// Business details printed on an invoice (never fails: web defaults).
final managerInvoiceBusinessProvider =
    FutureProvider.autoDispose<InvoiceBusiness>(
      (ref) => ref.watch(managerRepositoryProvider).invoiceBusiness(),
    );

/// WhatsApp chats, newest message first (More badge = their unread sum).
final managerWhatsAppConversationsProvider =
    FutureProvider.autoDispose<List<WhatsAppConversation>>(
      (ref) => ref.watch(managerRepositoryProvider).whatsAppConversations(),
    );

/// One chat (conversation row + merged messages), keyed by phone.
final managerWhatsAppThreadProvider = FutureProvider.autoDispose
    .family<WhatsAppThread, String>(
      (ref, phone) =>
          ref.watch(managerRepositoryProvider).whatsAppThread(phone),
    );

/// Whose trips a detail sheet lists.
typedef TripOwner = ({String kind, String id, String? name});

final managerOwnerTripsProvider = FutureProvider.autoDispose
    .family<List<ManagerBooking>, TripOwner>((ref, o) {
      final repo = ref.watch(managerRepositoryProvider);
      return switch (o.kind) {
        'driver' => repo.recentTrips(driverId: o.id),
        'vehicle' => repo.recentTrips(vehicleId: o.id),
        _ => repo.recentTrips(customerId: o.id, customerName: o.name),
      };
    });

/// Invalidates every manager read provider (logout / account switch).
void invalidateManagerProviders(void Function(ProviderOrFamily) invalidate) {
  invalidate(managerDashboardProvider);
  invalidate(managerReportProvider);
  invalidate(managerAlertsProvider);
  invalidate(managerBookingsProvider);
  invalidate(managerBookingProvider);
  invalidate(managerTripTrackProvider);
  invalidate(managerPlannedRouteProvider);
  invalidate(managerDriversProvider);
  invalidate(managerVehiclesProvider);
  invalidate(managerFleetProvider);
  invalidate(managerVehicleBookingsProvider);
  invalidate(managerPendingExpensesProvider);
  invalidate(managerAttendanceProvider);
  invalidate(managerTripFilterProvider);
  invalidate(managerExpiringDocsProvider);
  invalidate(managerVehicleRecordsProvider);
  invalidate(managerDriverRecordsProvider);
  invalidate(managerCustomerRecordsProvider);
  invalidate(managerDocumentRecordsProvider);
  invalidate(managerOwnerTripsProvider);
  invalidate(managerInvoicesProvider);
  invalidate(managerInvoiceBusinessProvider);
  invalidate(managerWhatsAppConversationsProvider);
  invalidate(managerWhatsAppThreadProvider);
}
