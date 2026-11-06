// ─────────────────────────────────────────────────────────────────────────────
// report_vehicle_issue_screen.dart — "Report Issue" per the driver wireframe.
// Issue category, description, photo evidence, optional current location and a
// SUBMIT REPORT action. Delivered as a fleet alert via AlertRepository (never
// fakes success); location uses LocationService (foreground single fix).
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/demo/demo_session.dart';
import '../../models/driver_alert.dart';
import '../../models/gps_position.dart';
import '../../providers/alert_provider.dart';
import '../../repositories/alert_repository.dart';
import '../../services/location_service.dart';

const _issueTypes = <String>[
  'Mechanical Failure',
  'Flat Tire / Puncture',
  'Accident / Collision',
  'Electrical Issue',
  'Other',
];

const int _maxPhotoBytes = 10 * 1024 * 1024; // 10 MB

class ReportVehicleIssueScreen extends ConsumerStatefulWidget {
  const ReportVehicleIssueScreen({super.key, this.tripId, this.vehicleReg});

  final String? tripId;
  final String? vehicleReg;

  @override
  ConsumerState<ReportVehicleIssueScreen> createState() =>
      _ReportVehicleIssueScreenState();
}

class _ReportVehicleIssueScreenState
    extends ConsumerState<ReportVehicleIssueScreen> {
  final _picker = ImagePicker();
  final _description = TextEditingController();

  String? _issueType;
  XFile? _photo;
  int? _photoBytes;

  bool _shareLocation = true;
  bool _locating = false;
  GpsPosition? _location;
  String? _locationError;

  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    if (_shareLocation) _captureLocation();
  }

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  bool get _canSubmit => _issueType != null && !_submitting;

  // ── Location ──────────────────────────────────────────────────────────────

  Future<void> _captureLocation() async {
    setState(() {
      _locating = true;
      _locationError = null;
    });
    try {
      final service = LocationService();
      final status = await service.getStatus();
      if (!status.isGranted) {
        final requested = await service.requestPermission();
        if (!requested.isGranted) {
          if (mounted) {
            setState(() {
              _locating = false;
              _locationError = requested.label;
            });
          }
          return;
        }
      }
      final pos = await service.getCurrentPosition();
      if (mounted) {
        setState(() {
          _locating = false;
          _location = pos;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _locating = false;
          _locationError = 'Location unavailable';
        });
      }
    }
  }

  void _toggleLocation(bool value) {
    setState(() => _shareLocation = value);
    if (value && _location == null) {
      _captureLocation();
    }
  }

  // ── Photo ─────────────────────────────────────────────────────────────────

  Future<void> _pickPhoto() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take Photo'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from Gallery'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;

    XFile? file;
    try {
      file = await _picker.pickImage(
        source: source,
        imageQuality: 85,
        maxWidth: 2048,
      );
    } catch (_) {
      _snack('Could not open the camera or gallery.');
      return;
    }
    if (file == null || !mounted) return;

    int size;
    try {
      size = await File(file.path).length();
    } catch (_) {
      _snack('The selected file could not be read.');
      return;
    }
    if (size > _maxPhotoBytes) {
      _snack('Photo is too large. Please choose a file under 10 MB.');
      return;
    }

    setState(() {
      _photo = file;
      _photoBytes = size;
    });
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  Future<void> _submit() async {
    if (!_canSubmit) return;
    setState(() => _submitting = true);

    final repo = ref.read(alertRepositoryProvider);
    final photo = _photo;
    final photoUrl =
        photo == null ? null : await repo.uploadIssuePhoto(photo.path);

    try {
      await repo.raiseAlert(
        DriverAlertRequest(
          type: DriverAlertType.vehicleIssue,
          category: _issueType,
          description: _description.text,
          bookingId: widget.tripId,
          location: _shareLocation ? _location : null,
          photoUrl: photoUrl,
        ),
      );
    } on AlertException catch (e) {
      if (!mounted) return;
      _snack(e.message);
      setState(() => _submitting = false);
      return;
    }
    if (!mounted) return;

    _snack(switch ((DemoSession.active, photo != null && photoUrl == null)) {
      (true, _) => 'Demo mode — report not actually sent.',
      (_, true) => 'Report sent to dispatch (photo could not be uploaded).',
      _ => 'Report sent to dispatch.',
    });
    context.pop();
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Report Issue'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          if (widget.vehicleReg != null) ...[
            Row(
              children: [
                Icon(Icons.directions_car_outlined,
                    size: 18, color: theme.colorScheme.primary),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    'Vehicle · ${widget.vehicleReg}',
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
          ],

          // ── Issue type ──────────────────────────────────────────────────
          const _FieldLabel('Issue Type'),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: _issueType,
            isExpanded: true,
            hint: const Text('Select an issue category'),
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.build_outlined),
            ),
            items: _issueTypes
                .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                .toList(),
            onChanged: _submitting
                ? null
                : (v) => setState(() => _issueType = v),
          ),
          const SizedBox(height: 20),

          // ── Description ─────────────────────────────────────────────────
          const _FieldLabel('Description'),
          const SizedBox(height: 8),
          TextField(
            controller: _description,
            enabled: !_submitting,
            maxLines: 4,
            maxLength: 500,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              hintText: 'Describe what happened or what is wrong…',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 4),

          // ── Photo evidence ──────────────────────────────────────────────
          const _FieldLabel('Photo Evidence'),
          const SizedBox(height: 8),
          _PhotoEvidence(
            photo: _photo,
            size: _photoBytes,
            onAdd: _submitting ? null : _pickPhoto,
            onRemove: _submitting
                ? null
                : () => setState(() {
                      _photo = null;
                      _photoBytes = null;
                    }),
          ),
          const SizedBox(height: 20),

          // ── Share location ──────────────────────────────────────────────
          _ShareLocationTile(
            value: _shareLocation,
            locating: _locating,
            location: _location,
            error: _locationError,
            onChanged: _submitting ? null : _toggleLocation,
          ),
        ],
      ),
      bottomNavigationBar: _SubmitBar(
        enabled: _canSubmit,
        submitting: _submitting,
        onSubmit: _submit,
      ),
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.3,
        color: Theme.of(context).colorScheme.onSurface,
      ),
    );
  }
}

class _PhotoEvidence extends StatelessWidget {
  const _PhotoEvidence({
    required this.photo,
    required this.size,
    required this.onAdd,
    required this.onRemove,
  });

  final XFile? photo;
  final int? size;
  final VoidCallback? onAdd;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (photo != null) {
      final kb = ((size ?? 0) / 1024).toStringAsFixed(0);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: Image.file(
                  File(photo!.path),
                  width: double.infinity,
                  height: 180,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    height: 180,
                    width: double.infinity,
                    color: theme.colorScheme.surfaceContainerHigh,
                    alignment: Alignment.center,
                    child: const Icon(Icons.broken_image_outlined, size: 40),
                  ),
                ),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: Material(
                  color: Colors.black54,
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: onRemove,
                    child: const Padding(
                      padding: EdgeInsets.all(6),
                      child: Icon(Icons.close, size: 18, color: Colors.white),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '${photo!.name} · $kb KB',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          onTap: onAdd,
          borderRadius: BorderRadius.circular(14),
          child: _UploadBox(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.add_a_photo_outlined,
                    size: 28, color: theme.colorScheme.primary),
                const SizedBox(height: 8),
                const Text(
                  'Add Photo',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'PNG, JPG, GIF up to 10MB',
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

/// Tinted upload box with a hairline border (matches the wireframe tile).
class _UploadBox extends StatelessWidget {
  const _UploadBox({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 26),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: child,
    );
  }
}

class _ShareLocationTile extends StatelessWidget {
  const _ShareLocationTile({
    required this.value,
    required this.locating,
    required this.location,
    required this.error,
    required this.onChanged,
  });

  final bool value;
  final bool locating;
  final GpsPosition? location;
  final String? error;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final String subtitle;
    if (!value) {
      subtitle = 'Helps support team locate the vehicle';
    } else if (locating) {
      subtitle = 'Getting your location…';
    } else if (location != null) {
      subtitle = '${location!.latitude.toStringAsFixed(5)}, '
          '${location!.longitude.toStringAsFixed(5)}';
    } else if (error != null) {
      subtitle = error!;
    } else {
      subtitle = 'Helps support team locate the vehicle';
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(Icons.location_on_outlined,
                size: 22, color: theme.colorScheme.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Share Current Location',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          Switch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}

class _SubmitBar extends StatelessWidget {
  const _SubmitBar({
    required this.enabled,
    required this.submitting,
    required this.onSubmit,
  });

  final bool enabled;
  final bool submitting;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLowest,
        border: Border(
          top: BorderSide(color: theme.colorScheme.outlineVariant, width: 0.5),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: SizedBox(
            width: double.infinity,
            height: 52,
            child: FilledButton.icon(
              onPressed: enabled ? onSubmit : null,
              icon: submitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.send_outlined),
              label: Text(
                submitting ? 'SUBMITTING…' : 'SUBMIT REPORT',
                style: const TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.4,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
