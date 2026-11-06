// ─────────────────────────────────────────────────────────────────────────────
// route_fix_sheet.dart
// "Fix route location" flow. When a manager typed a wrong/unfindable place
// name, the driver is asked which place they mean. We geocode the corrected
// text and — on success — save the corrected name + coordinates back to the
// booking's `type_data`, so the map is fixed for good.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/trip.dart';
import '../../providers/route_map_provider.dart';
import '../../providers/trip_provider.dart';

/// Which endpoint the driver is correcting.
enum RouteEndpoint { pickup, drop }

/// Opens the correction sheet. Returns true when a correction was saved.
Future<bool> showRouteFixSheet(
  BuildContext context, {
  required TripModel trip,
  required RouteEndpoint endpoint,
  required String currentLabel,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _RouteFixSheet(
      trip: trip,
      endpoint: endpoint,
      currentLabel: currentLabel,
    ),
  );
  return result ?? false;
}

class _RouteFixSheet extends ConsumerStatefulWidget {
  const _RouteFixSheet({
    required this.trip,
    required this.endpoint,
    required this.currentLabel,
  });

  final TripModel trip;
  final RouteEndpoint endpoint;
  final String currentLabel;

  @override
  ConsumerState<_RouteFixSheet> createState() => _RouteFixSheetState();
}

class _RouteFixSheetState extends ConsumerState<_RouteFixSheet> {
  late final TextEditingController _controller;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.currentLabel);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final text = _controller.text.trim();
    if (text.length < 3) {
      setState(() => _error = 'Enter a more specific place name.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      // 1. Geocode the corrected place.
      final point = await ref.read(expectedRouteServiceProvider).geocode(text);
      if (point == null) {
        setState(() {
          _busy = false;
          _error = 'Could not find "$text". Try adding a city or landmark.';
        });
        return;
      }

      // 2. Persist name + coordinates to the booking's type_data.
      final notifier = ref.read(tripDetailProvider(widget.trip.id).notifier);
      await notifier.saveRoutePlaces(
        pickupLat: widget.endpoint == RouteEndpoint.pickup
            ? point.latitude
            : null,
        pickupLng: widget.endpoint == RouteEndpoint.pickup
            ? point.longitude
            : null,
        pickupPlace: widget.endpoint == RouteEndpoint.pickup ? text : null,
        dropLat: widget.endpoint == RouteEndpoint.drop ? point.latitude : null,
        dropLng: widget.endpoint == RouteEndpoint.drop ? point.longitude : null,
        dropPlace: widget.endpoint == RouteEndpoint.drop ? text : null,
      );

      // 3. Recompute the route preview so the map updates.
      ref.invalidate(routePreviewProvider(widget.trip));

      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() {
        _busy = false;
        _error = 'Could not save: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isPickup = widget.endpoint == RouteEndpoint.pickup;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        4,
        20,
        MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                isPickup ? Icons.trip_origin : Icons.location_on,
                color: isPickup ? Colors.green.shade700 : Colors.red.shade700,
              ),
              const SizedBox(width: 10),
              Text(
                isPickup ? 'Fix pickup location' : 'Fix drop-off location',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'The route name couldn\'t be found on the map. Tell us which place '
            'you mean and we\'ll save it.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            autofocus: true,
            textInputAction: TextInputAction.done,
            enabled: !_busy,
            onSubmitted: (_) => _save(),
            decoration: InputDecoration(
              labelText: isPickup ? 'Pickup place' : 'Drop-off place',
              hintText: 'e.g. Puducherry Railway Station',
              border: const OutlineInputBorder(),
              errorText: _error,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _busy
                      ? null
                      : () => Navigator.of(context).pop(false),
                  child: const Text('Cancel'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.icon(
                  onPressed: _busy ? null : _save,
                  icon: _busy
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check),
                  label: Text(_busy ? 'Saving…' : 'Save place'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'We look up the place with OpenStreetMap and store the coordinates '
            'on this trip.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
