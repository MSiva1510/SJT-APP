// ─────────────────────────────────────────────────────────────────────────────
// attendance.dart
// Mirrors the actual `attendance` table in Supabase.
//
// Verified columns (2026-08-17):
//   id, driver_id, attendance_date, status, leave_type,
//   vehicle_assigned, notes, driver_name,
//   check_in (TEXT "HH:MM"), check_out (TEXT "HH:MM"),
//   working_hours (TEXT "X hours"), created_at, updated_at
//
// check_in/check_out are stored as "HH:MM" TEXT strings (IST local time).
// working_hours is stored as "X hours" or "X hours Y minutes" TEXT string.
// The Web ERP also auto-fills attendance from trips.
// Flutter must use the same table and format — no duplicate tables.
// ─────────────────────────────────────────────────────────────────────────────

class AttendanceModel {
  final String  id;
  final String  driverId;        // UUID → drivers.id
  final String? driverName;      // denormalised TEXT

  final DateTime attendanceDate; // DATE column
  final String   status;         // 'present' | 'absent' | 'leave'
  final String?  leaveType;

  // TEXT "HH:MM" — same format the Web ERP uses
  final String?  checkIn;
  final String?  checkOut;
  final String?  workingHours;   // TEXT e.g. "9 hours"

  final String?  vehicleAssigned; // UUID → vehicles.id (nullable)
  final String?  notes;

  final DateTime? createdAt;
  final DateTime? updatedAt;

  const AttendanceModel({
    required this.id,
    required this.driverId,
    required this.attendanceDate,
    required this.status,
    this.driverName,
    this.leaveType,
    this.checkIn,
    this.checkOut,
    this.workingHours,
    this.vehicleAssigned,
    this.notes,
    this.createdAt,
    this.updatedAt,
  });

  // ── Columns the driver app requests ──────────────────────────────────────
  // vehicle_assigned and leave_type included for completeness but not shown.
  static const String selectColumns =
      'id, driver_id, driver_name, attendance_date, status, '
      'check_in, check_out, working_hours, notes, '
      'created_at, updated_at';

  factory AttendanceModel.fromMap(Map<String, dynamic> m) {
    return AttendanceModel(
      id:               m['id']               as String,
      driverId:         m['driver_id']        as String,
      driverName:       m['driver_name']      as String?,
      attendanceDate:   DateTime.parse(m['attendance_date'] as String),
      status:           m['status']           as String? ?? 'present',
      leaveType:        m['leave_type']       as String?,
      checkIn:          m['check_in']         as String?,
      checkOut:         m['check_out']        as String?,
      workingHours:     m['working_hours']    as String?,
      vehicleAssigned:  m['vehicle_assigned'] as String?,
      notes:            m['notes']            as String?,
      createdAt:        _dt(m['created_at']),
      updatedAt:        _dt(m['updated_at']),
    );
  }

  static DateTime? _dt(dynamic v) =>
      v == null ? null : DateTime.tryParse(v.toString())?.toLocal();

  // ── Computed ──────────────────────────────────────────────────────────────

  bool get isCheckedIn  => checkIn  != null && checkIn!.isNotEmpty;
  bool get isCheckedOut => checkOut != null && checkOut!.isNotEmpty;
  bool get isComplete   => isCheckedIn && isCheckedOut;
  bool get isWorking    => isCheckedIn && !isCheckedOut;

  bool get isToday {
    final today = DateTime.now();
    return attendanceDate.year  == today.year  &&
           attendanceDate.month == today.month &&
           attendanceDate.day   == today.day;
  }

  String get statusLabel => switch (status) {
        'present' => 'Present',
        'absent'  => 'Absent',
        'leave'   => 'On Leave',
        _         => status,
      };

  String get displayDate {
    const months = [
      '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return '${attendanceDate.day} ${months[attendanceDate.month]} '
        '${attendanceDate.year}';
  }

  @override
  bool operator ==(Object other) =>
      other is AttendanceModel && other.id == id;

  @override
  int get hashCode => id.hashCode;
}
