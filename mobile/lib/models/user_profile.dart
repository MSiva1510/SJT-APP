// ─────────────────────────────────────────────────────────────────────────────
// user_profile.dart
// Mirrors the actual `profiles` table in Supabase.
// Columns verified from live schema:
//   id UUID, email TEXT, full_name TEXT, role TEXT
// ─────────────────────────────────────────────────────────────────────────────

class UserProfile {
  final String id; // = auth.uid()
  final String email;
  final String fullName;
  final String role; // 'admin' | 'manager' | 'driver'

  const UserProfile({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
  });

  factory UserProfile.fromMap(Map<String, dynamic> map) {
    return UserProfile(
      id: map['id'] as String? ?? '',
      email: map['email'] as String? ?? '',
      fullName: map['full_name'] as String? ?? '',
      role: map['role'] as String? ?? '',
    );
  }

  Map<String, dynamic> toMap() => {
    'id': id,
    'email': email,
    'full_name': fullName,
    'role': role,
  };

  bool get isDriver => role == 'driver';
  bool get isManager => role == 'manager';
  bool get isAdmin => role == 'admin';
  bool get isStaff => isManager || isAdmin;

  /// Display-ready initials for avatar fallback
  String get initials {
    final parts = fullName.trim().split(' ');
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
    }
    return fullName.isNotEmpty ? fullName[0].toUpperCase() : '?';
  }

  UserProfile copyWith({
    String? id,
    String? email,
    String? fullName,
    String? role,
  }) => UserProfile(
    id: id ?? this.id,
    email: email ?? this.email,
    fullName: fullName ?? this.fullName,
    role: role ?? this.role,
  );

  @override
  String toString() =>
      'UserProfile(id: $id, email: $email, fullName: $fullName, role: $role)';

  @override
  bool operator ==(Object other) =>
      other is UserProfile && other.id == id && other.role == role;

  @override
  int get hashCode => Object.hash(id, role);
}
