// ─────────────────────────────────────────────────────────────────────────────
// driver_profile.dart
// Mirrors the actual `drivers` table in Supabase.
// Columns verified from live schema (no user_id — linked via profile_id UUID
// added in Day 42 migration, with email fallback for legacy rows).
// ─────────────────────────────────────────────────────────────────────────────

class DriverProfile {
  // ── Primary keys ────────────────────────────────────────────────────────
  final String id; // UUID primary key
  final String? driverId; // Human-readable ID e.g. "DRV-001"
  final String? profileId; // UUID → auth.users.id (FK added Day 42)

  // ── Identity ─────────────────────────────────────────────────────────────
  final String name;
  final String? email;
  final String? phone;
  final String? address;
  final String? city;

  // ── Employment ───────────────────────────────────────────────────────────
  final String? status; // 'active' | 'inactive' | 'on_leave'
  final String? salaryType; // 'monthly' | 'per_trip'
  final double? baseSalary;
  final double? dailyBata;
  final double? perTripIncentive;
  final DateTime? joinedDate;

  // ── License ──────────────────────────────────────────────────────────────
  final String? licenseNumber;
  final DateTime? licenseExpiry;
  final String? licensePhotoUrl;
  final String? aadharNumber;
  final DateTime? dateOfBirth;

  // ── Bank ─────────────────────────────────────────────────────────────────
  final String? bankAccount;
  final String? bankIfsc;
  final String? bankName;

  // ── Emergency ────────────────────────────────────────────────────────────
  final String? emergencyContact;
  final String? emergencyPhone;

  // ── Media ────────────────────────────────────────────────────────────────
  final String? photoUrl;
  final String? avatarUrl;
  final String? notes;

  // ── Timestamps ───────────────────────────────────────────────────────────
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const DriverProfile({
    required this.id,
    required this.name,
    this.driverId,
    this.profileId,
    this.email,
    this.phone,
    this.address,
    this.city,
    this.status,
    this.salaryType,
    this.baseSalary,
    this.dailyBata,
    this.perTripIncentive,
    this.joinedDate,
    this.licenseNumber,
    this.licenseExpiry,
    this.licensePhotoUrl,
    this.aadharNumber,
    this.dateOfBirth,
    this.bankAccount,
    this.bankIfsc,
    this.bankName,
    this.emergencyContact,
    this.emergencyPhone,
    this.photoUrl,
    this.avatarUrl,
    this.notes,
    this.createdAt,
    this.updatedAt,
  });

  factory DriverProfile.fromMap(Map<String, dynamic> map) {
    return DriverProfile(
      id: _str(map, 'id'),
      driverId: map['driver_id'] as String?,
      profileId: map['profile_id'] as String?,
      name: _str(map, 'name'),
      email: map['email'] as String?,
      phone: map['phone'] as String?,
      address: map['address'] as String?,
      city: map['city'] as String?,
      status: map['status'] as String?,
      salaryType: map['salary_type'] as String?,
      baseSalary: _num(map, 'base_salary'),
      dailyBata: _num(map, 'daily_bata'),
      perTripIncentive: _num(map, 'per_trip_incentive'),
      joinedDate: _date(map, 'joined_date'),
      licenseNumber: map['license_number'] as String?,
      licenseExpiry: _date(map, 'license_expiry'),
      licensePhotoUrl: map['license_photo_url'] as String?,
      aadharNumber: map['aadhar_number'] as String?,
      dateOfBirth: _date(map, 'date_of_birth'),
      bankAccount: map['bank_account'] as String?,
      bankIfsc: map['bank_ifsc'] as String?,
      bankName: map['bank_name'] as String?,
      emergencyContact: map['emergency_contact'] as String?,
      emergencyPhone: map['emergency_phone'] as String?,
      photoUrl: map['photo_url'] as String?,
      avatarUrl: map['avatar_url'] as String?,
      notes: map['notes'] as String?,
      createdAt: _datetime(map, 'created_at'),
      updatedAt: _datetime(map, 'updated_at'),
    );
  }

  // ── Computed helpers ─────────────────────────────────────────────────────
  bool get isActive => status == 'active';
  bool get isOnLeave => status == 'on_leave';

  /// Best available photo URL (driver photo > avatar > null)
  String? get displayPhotoUrl => photoUrl ?? avatarUrl;

  /// Display-ready initials for avatar fallback
  String get initials {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
    }
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }

  bool get isLicenseExpiringSoon {
    if (licenseExpiry == null) return false;
    return licenseExpiry!.difference(DateTime.now()).inDays < 30;
  }

  bool get isLicenseExpired {
    if (licenseExpiry == null) return false;
    return licenseExpiry!.isBefore(DateTime.now());
  }

  // ── Private parsers ──────────────────────────────────────────────────────
  static String _str(Map<String, dynamic> m, String k) => m[k] as String? ?? '';

  static double? _num(Map<String, dynamic> m, String k) {
    final v = m[k];
    if (v == null) return null;
    return (v as num).toDouble();
  }

  static DateTime? _date(Map<String, dynamic> m, String k) {
    final v = m[k] as String?;
    if (v == null) return null;
    return DateTime.tryParse(v);
  }

  static DateTime? _datetime(Map<String, dynamic> m, String k) {
    final v = m[k] as String?;
    if (v == null) return null;
    return DateTime.tryParse(v)?.toLocal();
  }

  @override
  String toString() => 'DriverProfile(id: $id, name: $name, status: $status)';

  @override
  bool operator ==(Object other) => other is DriverProfile && other.id == id;

  @override
  int get hashCode => id.hashCode;
}
