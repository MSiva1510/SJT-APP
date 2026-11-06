// ─────────────────────────────────────────────────────────────────────────────
// manager_new_booking_screen.dart — manager "New booking" flow in 5 steps:
// (1) trip type · (2) customer · (3) schedule & route · (4) vehicle & driver
// · (5) fare & review → Create booking.
//
// Writes through ManagerRepository.createBooking (FY26-MON-#### numbering,
// availability re-check, created_by). Vehicles / drivers already held by an
// open booking in the chosen dates are shown disabled with a "Booked" tag.
// On success: invalidates the trip lists + dashboard and replaces this page
// with the new trip's detail.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/formatters.dart';
import '../../models/manager_models.dart';
import '../../models/new_booking.dart';
import '../../navigation/app_router.dart';
import '../../providers/auth_provider.dart';
import '../../providers/manager_provider.dart';
import '../../widgets/driver/status_chip.dart';
import '../../widgets/manager/manager_ui.dart';
import '../../../core/theme/home_tokens.dart';

// ── Screen-local providers (autoDispose: gone when the page closes) ──────────

final managerRecentCustomersProvider =
    FutureProvider.autoDispose<List<CustomerOption>>((ref) {
      return ref.watch(managerRepositoryProvider).recentCustomers();
    });

typedef BookingRange = ({DateTime start, DateTime end});

final managerBusyProvider = FutureProvider.autoDispose
    .family<BusyResources, BookingRange>((ref, r) {
      return ref.watch(managerRepositoryProvider).busyResources(r.start, r.end);
    });

IconData tripTypeIcon(TripType t) => switch (t) {
  TripType.oneWay => Icons.arrow_right_alt_rounded,
  TripType.roundTrip => Icons.sync_alt_rounded,
  TripType.localVisit => Icons.place_outlined,
  TripType.multiDay => Icons.date_range_outlined,
  TripType.rentalWithDriver => Icons.car_rental_outlined,
  TripType.selfDrive => Icons.key_outlined,
};

const _stepLabels = ['Type', 'Customer', 'Schedule', 'Vehicle', 'Review'];

final _dateFmt = DateFormat('EEE, d MMM yyyy');

String _hhmm(TimeOfDay t) =>
    '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

int _minutes(TimeOfDay t) => t.hour * 60 + t.minute;

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

double? _money(String s) {
  final v = s.replaceAll(',', '').replaceAll('₹', '').trim();
  return v.isEmpty ? null : double.tryParse(v);
}

class ManagerNewBookingScreen extends ConsumerStatefulWidget {
  const ManagerNewBookingScreen({super.key, this.now, this.initialCustomer});

  /// Injected clock for tests; defaults to DateTime.now().
  final DateTime? now;

  /// Customer to start with (from the Customers screen).
  final CustomerOption? initialCustomer;

  @override
  ConsumerState<ManagerNewBookingScreen> createState() =>
      _ManagerNewBookingScreenState();
}

class _ManagerNewBookingScreenState
    extends ConsumerState<ManagerNewBookingScreen> {
  int _step = 0;
  int _reached = 0;
  bool _saving = false;
  Map<String, String> _errors = {};

  TripType? _type;

  // Customer
  final _name = TextEditingController();
  final _phone = TextEditingController();
  String? _customerId;

  // Schedule
  DateTime? _startDate;
  TimeOfDay? _startTime;
  DateTime? _endDate;
  TimeOfDay? _endTime;
  final _pickup = TextEditingController();
  final _drop = TextEditingController();
  final List<TextEditingController> _stops = [TextEditingController()];
  final _waiting = TextEditingController();
  final _days = TextEditingController(text: '2');
  final _deposit = TextEditingController();
  final _startKm = TextEditingController();

  // Vehicle & driver
  VehicleOption? _vehicle;
  DriverOption? _driver;

  // Fare
  final _fare = TextEditingController();
  final _advance = TextEditingController();
  final _notes = TextEditingController();

  DateTime get _today => _day(widget.now ?? DateTime.now());

  @override
  void initState() {
    super.initState();
    final c = widget.initialCustomer;
    if (c != null) {
      _name.text = c.name;
      _phone.text = c.contact ?? '';
      _customerId = c.customerId;
    }
  }

  @override
  void dispose() {
    for (final c in [
      _name,
      _phone,
      _pickup,
      _drop,
      ..._stops,
      _waiting,
      _days,
      _deposit,
      _startKm,
      _fare,
      _advance,
      _notes,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  bool get _hasReturnDate =>
      _type == TripType.roundTrip || (_type?.isRental ?? false);

  DateTime? get _lastDay {
    final s = _startDate;
    if (s == null) return null;
    if (_type == TripType.multiDay) {
      final n = int.tryParse(_days.text.trim()) ?? 1;
      return _day(s).add(Duration(days: (n < 1 ? 1 : n) - 1));
    }
    if (_hasReturnDate && _endDate != null && _endDate!.isAfter(s)) {
      return _day(_endDate!);
    }
    return _day(s);
  }

  BookingRange? get _range =>
      _startDate == null ? null : (start: _day(_startDate!), end: _lastDay!);

  NewBookingDraft _draft() {
    final type = _type!;
    return NewBookingDraft(
      type: type,
      customerName: _name.text.trim(),
      customerContact: normalizeIndianMobile(_phone.text),
      customerId: _customerId,
      startDate: _startDate!,
      startTime: _startTime == null ? null : _hhmm(_startTime!),
      endDate: _hasReturnDate ? _endDate : null,
      endTime: (_hasReturnDate && _endTime != null) ? _hhmm(_endTime!) : null,
      pickup: _pickup.text,
      drop: type == TripType.localVisit ? null : _drop.text,
      stops: type == TripType.localVisit
          ? [for (final c in _stops) c.text]
          : const [],
      waitingTime: type == TripType.localVisit ? _waiting.text : null,
      numberOfDays: type == TripType.multiDay
          ? int.tryParse(_days.text.trim())
          : null,
      securityDeposit: type == TripType.selfDrive
          ? _money(_deposit.text)
          : null,
      startKm: type == TripType.selfDrive ? _money(_startKm.text) : null,
      vehicle: _vehicle!,
      driver: type.needsDriver ? _driver : null,
      totalFare: _money(_fare.text),
      advance: _money(_advance.text),
      notes: _notes.text,
    );
  }

  // ── Validation per step ────────────────────────────────────────────────────

  Map<String, String> _validate(int step) {
    final e = <String, String>{};
    switch (step) {
      case 0:
        if (_type == null) e['type'] = 'Choose a trip type';
      case 1:
        final n = customerNameError(_name.text);
        if (n != null) e['name'] = n;
        final p = indianMobileError(_phone.text);
        if (p != null) e['phone'] = p;
      case 2:
        final type = _type!;
        if (_startDate == null) {
          e['startDate'] = 'Pick the trip date';
        } else if (_day(_startDate!).isBefore(_today)) {
          e['startDate'] = 'The date cannot be in the past';
        }
        void req(TextEditingController c, String key, String msg) {
          if (c.text.trim().isEmpty) e[key] = msg;
        }

        switch (type) {
          case TripType.oneWay:
            req(_pickup, 'pickup', 'Enter the pickup location');
            req(_drop, 'drop', 'Enter the drop location');
          case TripType.roundTrip:
            req(_pickup, 'pickup', 'Enter the pickup location');
            req(_drop, 'drop', 'Enter the destination');
            if (_endDate == null) e['endDate'] = 'Pick the return date';
          case TripType.localVisit:
            req(_pickup, 'pickup', 'Enter the base location');
            if (_stops.every((c) => c.text.trim().isEmpty)) {
              e['stops'] = 'Add at least one stop';
            }
          case TripType.multiDay:
            req(_pickup, 'pickup', 'Enter the pickup location');
            req(_drop, 'drop', 'Enter the destination');
            final n = int.tryParse(_days.text.trim());
            if (n == null || n < 1 || n > 60) {
              e['days'] = 'Enter 1 to 60 days';
            }
          case TripType.rentalWithDriver:
            break;
          case TripType.selfDrive:
            final dep = _deposit.text.trim();
            if (dep.isNotEmpty && ((_money(dep) ?? -1) < 0)) {
              e['deposit'] = 'Enter an amount';
            }
            final km = _startKm.text.trim();
            if (km.isNotEmpty && ((_money(km) ?? -1) < 0)) {
              e['startKm'] = 'Enter the odometer reading';
            }
        }
        if (_hasReturnDate && _startDate != null && _endDate != null) {
          if (_day(_endDate!).isBefore(_day(_startDate!))) {
            e['endDate'] = 'Return date must be on or after the start date';
          } else if (_day(_endDate!) == _day(_startDate!) &&
              _startTime != null &&
              _endTime != null &&
              _minutes(_endTime!) <= _minutes(_startTime!)) {
            e['endTime'] = 'Return time must be after the pickup time';
          }
        }
        if (_hasReturnDate &&
            _endDate == null &&
            _startTime != null &&
            _endTime != null &&
            _minutes(_endTime!) <= _minutes(_startTime!)) {
          e['endTime'] = 'Return time must be after the pickup time';
        }
      case 3:
        if (_vehicle == null) e['vehicle'] = 'Choose a vehicle';
      case 4:
        final fare = _fare.text.trim();
        final adv = _advance.text.trim();
        final f = _money(fare);
        final a = _money(adv);
        if (fare.isNotEmpty && (f == null || f < 0)) {
          e['fare'] = 'Enter an amount';
        }
        if (adv.isNotEmpty && (a == null || a < 0)) {
          e['advance'] = 'Enter an amount';
        }
        if (f != null && a != null && a > f) {
          e['advance'] = 'Advance cannot be more than the total fare';
        }
    }
    return e;
  }

  void _goTo(int step) {
    FocusScope.of(context).unfocus();
    setState(() {
      _errors = {};
      _step = step;
      if (step > _reached) _reached = step;
    });
  }

  void _next() {
    final e = _validate(_step);
    if (e.isNotEmpty) {
      setState(() => _errors = e);
      return;
    }
    _goTo(_step + 1);
  }

  void _back() {
    if (_step == 0) {
      context.pop();
    } else {
      _goTo(_step - 1);
    }
  }

  /// Header taps: back freely; forward only through valid steps.
  void _jump(int target) {
    if (target == _step || target > _reached) return;
    if (target < _step) return _goTo(target);
    for (var s = _step; s < target; s++) {
      final e = _validate(s);
      if (e.isNotEmpty) {
        setState(() {
          _step = s;
          _errors = e;
        });
        return;
      }
    }
    _goTo(target);
  }

  /// Dates changed → a picked vehicle / driver may be booked in the new range.
  void _scheduleChanged() {
    setState(() {
      _vehicle = null;
      _driver = null;
      if (_reached > 3) _reached = 3;
    });
  }

  Future<void> _create() async {
    for (var s = 0; s <= 4; s++) {
      final e = _validate(s);
      if (e.isNotEmpty) {
        setState(() {
          _step = s;
          _errors = e;
        });
        return;
      }
    }
    final actor = ref.read(managerActorProvider);
    final profile = ref.read(currentProfileProvider);
    setState(() => _saving = true);
    try {
      final created = await ref
          .read(managerRepositoryProvider)
          .createBooking(
            _draft(),
            actorName: actor.name,
            actorId: (profile?.id.isNotEmpty ?? false) ? profile!.id : null,
            actorRole: actor.role,
          );
      if (!mounted) return;
      ref.invalidate(managerBookingsProvider);
      ref.invalidate(managerDashboardProvider);
      showManagerSnack(context, 'Booking ${created.bookingNumber} created');
      context.pushReplacement(AppRoutes.managerTripDetail(created.id));
    } catch (e) {
      if (!mounted) return;
      ref.invalidate(managerBusyProvider);
      setState(() => _saving = false);
      showManagerSnack(context, managerErrorText(e), error: true);
    }
  }

  // ── Pickers ────────────────────────────────────────────────────────────────

  Future<void> _pickStartDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _startDate ?? _today,
      firstDate: _today,
      lastDate: _today.add(const Duration(days: 730)),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _startDate = picked;
      if (_endDate != null && _endDate!.isBefore(picked)) _endDate = picked;
      _errors.remove('startDate');
    });
    _scheduleChanged();
  }

  Future<void> _pickEndDate() async {
    final first = _startDate ?? _today;
    final picked = await showDatePicker(
      context: context,
      initialDate: (_endDate != null && !_endDate!.isBefore(first))
          ? _endDate!
          : first,
      firstDate: first,
      lastDate: first.add(const Duration(days: 365)),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _endDate = picked;
      _errors.remove('endDate');
    });
    _scheduleChanged();
  }

  Future<void> _pickTime(bool start) async {
    final picked = await showTimePicker(
      context: context,
      initialTime:
          (start ? _startTime : _endTime) ??
          const TimeOfDay(hour: 9, minute: 0),
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (start) {
        _startTime = picked;
      } else {
        _endTime = picked;
        _errors.remove('endTime');
      }
    });
  }

  Future<void> _pickCustomer() async {
    final picked = await showModalBottomSheet<CustomerOption>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _CustomerPickerSheet(),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _name.text = picked.name;
      _phone.text = picked.contact ?? '';
      _customerId = picked.customerId;
      _errors.remove('name');
      _errors.remove('phone');
    });
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return PopScope(
      canPop: !_saving,
      child: Scaffold(
        backgroundColor: t.canvas,
        appBar: AppBar(
          backgroundColor: t.canvas,
          surfaceTintColor: Colors.transparent,
          title: const Text('New booking'),
          actions: [
            IconButton(
              tooltip: 'Close',
              onPressed: _saving ? null : () => context.pop(),
              icon: const Icon(Icons.close),
            ),
          ],
        ),
        body: Column(
          children: [
            _StepHeader(step: _step, reached: _reached, onTap: _jump),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 220),
                child: KeyedSubtree(
                  key: ValueKey(_step),
                  child: switch (_step) {
                    0 => _typeStep(t),
                    1 => _customerStep(t),
                    2 => _scheduleStep(t),
                    3 => _vehicleStep(t),
                    _ => _reviewStep(t),
                  },
                ),
              ),
            ),
            _bottomBar(t),
          ],
        ),
      ),
    );
  }

  Widget _bottomBar(HomeTokens t) {
    final last = _step == 4;
    return Material(
      color: t.card,
      child: SafeArea(
        top: false,
        child: Container(
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: t.cardBorder)),
          ),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
          child: Row(
            children: [
              if (_step > 0) ...[
                Expanded(
                  flex: 2,
                  child: OutlinedButton(
                    key: const Key('nb-back'),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 50),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    onPressed: _saving ? null : _back,
                    child: const Text('Back'),
                  ),
                ),
                const SizedBox(width: 12),
              ],
              Expanded(
                flex: 3,
                child: FilledButton(
                  key: Key(last ? 'nb-create' : 'nb-next'),
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 50)),
                  onPressed: _saving ? null : (last ? _create : _next),
                  child: _saving
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2.4),
                        )
                      : Text(last ? 'Create booking' : 'Next'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _page(List<Widget> children) => ListView(
    padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
    children: children,
  );

  // ── Step 1: type ───────────────────────────────────────────────────────────

  Widget _typeStep(HomeTokens t) {
    return _page([
      const _StepIntro(
        title: 'What kind of trip?',
        subtitle: 'This decides the details we ask for next.',
      ),
      if (_errors['type'] != null) _ErrorLine(_errors['type']!),
      for (final type in TripType.values) ...[
        _TypeCard(
          type: type,
          selected: _type == type,
          onTap: () => setState(() {
            if (_type != type) {
              _type = type;
              if (!type.needsDriver) _driver = null;
              if (_reached > 1) _reached = 1;
            }
            _errors = {};
          }),
        ),
        const SizedBox(height: 10),
      ],
    ]);
  }

  // ── Step 2: customer ───────────────────────────────────────────────────────

  Widget _customerStep(HomeTokens t) {
    return _page([
      const _StepIntro(
        title: 'Who is travelling?',
        subtitle: 'Pick a previous customer or enter new details.',
      ),
      OutlinedButton.icon(
        key: const Key('nb-pick-customer'),
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(46),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        onPressed: _pickCustomer,
        icon: const Icon(Icons.history_rounded, size: 20),
        label: const Text('Choose a previous customer'),
      ),
      const SizedBox(height: 18),
      TextField(
        key: const Key('nb-name'),
        controller: _name,
        textCapitalization: TextCapitalization.words,
        textInputAction: TextInputAction.next,
        inputFormatters: [LengthLimitingTextInputFormatter(60)],
        onChanged: (_) => setState(() {
          _customerId = null;
          _errors.remove('name');
        }),
        decoration: InputDecoration(
          labelText: 'Customer name',
          prefixIcon: const Icon(Icons.person_outline),
          errorText: _errors['name'],
        ),
      ),
      const SizedBox(height: 14),
      TextField(
        key: const Key('nb-phone'),
        controller: _phone,
        keyboardType: TextInputType.phone,
        inputFormatters: [
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(10),
        ],
        onChanged: (_) => setState(() {
          _customerId = null;
          _errors.remove('phone');
        }),
        decoration: InputDecoration(
          labelText: 'Mobile number (optional)',
          prefixIcon: const Icon(Icons.phone_outlined),
          prefixText: '+91 ',
          errorText: _errors['phone'],
          helperText: _errors['phone'] == null
              ? '10-digit Indian mobile'
              : null,
        ),
      ),
      if (_customerId != null) ...[
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: MTag(
            label: 'Linked to an existing customer',
            color: t.success,
            icon: Icons.link_rounded,
          ),
        ),
      ],
    ]);
  }

  // ── Step 3: schedule & route ───────────────────────────────────────────────

  Widget _scheduleStep(HomeTokens t) {
    final type = _type!;
    final rental = type.isRental;
    final pickupLabel = switch (type) {
      TripType.localVisit => 'Base location',
      TripType.rentalWithDriver ||
      TripType.selfDrive => 'Pickup location (optional)',
      _ => 'Pickup location',
    };
    final dropLabel = switch (type) {
      TripType.oneWay => 'Drop location',
      TripType.rentalWithDriver ||
      TripType.selfDrive => 'Destination (optional)',
      _ => 'Destination',
    };
    final last = _lastDay;

    return _page([
      _StepIntro(
        title: 'When and where?',
        subtitle: '${type.label} · ${type.description}',
      ),
      const MSectionLabel('Schedule'),
      _PickerField(
        key: const Key('nb-start-date'),
        label: rental ? 'Pickup date' : 'Trip date',
        icon: Icons.event_outlined,
        value: _startDate == null ? null : _dateFmt.format(_startDate!),
        placeholder: 'Select date',
        error: _errors['startDate'],
        onTap: _pickStartDate,
      ),
      const SizedBox(height: 12),
      _PickerField(
        key: const Key('nb-start-time'),
        label: rental ? 'Pickup time (optional)' : 'Start time (optional)',
        icon: Icons.schedule_outlined,
        value: _startTime == null ? null : managerClock(_hhmm(_startTime!)),
        placeholder: 'Select time',
        onTap: () => _pickTime(true),
        onClear: _startTime == null
            ? null
            : () => setState(() => _startTime = null),
      ),
      if (_hasReturnDate) ...[
        const SizedBox(height: 12),
        _PickerField(
          key: const Key('nb-end-date'),
          label: type == TripType.roundTrip
              ? 'Return date'
              : 'Return date (optional)',
          icon: Icons.event_repeat_outlined,
          value: _endDate == null ? null : _dateFmt.format(_endDate!),
          placeholder: rental ? 'Same day' : 'Select date',
          error: _errors['endDate'],
          onTap: _pickEndDate,
          onClear: (_endDate == null || type == TripType.roundTrip)
              ? null
              : () {
                  setState(() => _endDate = null);
                  _scheduleChanged();
                },
        ),
        const SizedBox(height: 12),
        _PickerField(
          key: const Key('nb-end-time'),
          label: 'Return time (optional)',
          icon: Icons.schedule_outlined,
          value: _endTime == null ? null : managerClock(_hhmm(_endTime!)),
          placeholder: 'Select time',
          error: _errors['endTime'],
          onTap: () => _pickTime(false),
          onClear: _endTime == null
              ? null
              : () => setState(() => _endTime = null),
        ),
      ],
      if (type == TripType.multiDay) ...[
        const SizedBox(height: 12),
        TextField(
          key: const Key('nb-days'),
          controller: _days,
          keyboardType: TextInputType.number,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(2),
          ],
          onChanged: (_) {
            setState(() => _errors.remove('days'));
            _scheduleChanged();
          },
          decoration: InputDecoration(
            labelText: 'Number of days',
            prefixIcon: const Icon(Icons.calendar_view_week_outlined),
            errorText: _errors['days'],
            helperText:
                (_errors['days'] == null && last != null && _startDate != null)
                ? 'Ends ${_dateFmt.format(last)}'
                : null,
          ),
        ),
      ],
      const SizedBox(height: 22),
      const MSectionLabel('Route'),
      TextField(
        key: const Key('nb-pickup'),
        controller: _pickup,
        textCapitalization: TextCapitalization.words,
        textInputAction: TextInputAction.next,
        inputFormatters: [LengthLimitingTextInputFormatter(100)],
        onChanged: (_) => setState(() => _errors.remove('pickup')),
        decoration: InputDecoration(
          labelText: pickupLabel,
          prefixIcon: const Icon(Icons.trip_origin_rounded),
          errorText: _errors['pickup'],
        ),
      ),
      const SizedBox(height: 12),
      if (type == TripType.localVisit) ...[
        for (var i = 0; i < _stops.length; i++) ...[
          TextField(
            key: Key('nb-stop-$i'),
            controller: _stops[i],
            textCapitalization: TextCapitalization.words,
            inputFormatters: [LengthLimitingTextInputFormatter(100)],
            onChanged: (_) => setState(() => _errors.remove('stops')),
            decoration: InputDecoration(
              labelText: 'Stop ${i + 1}',
              prefixIcon: const Icon(Icons.place_outlined),
              suffixIcon: _stops.length == 1
                  ? null
                  : IconButton(
                      tooltip: 'Remove stop',
                      icon: const Icon(Icons.remove_circle_outline),
                      onPressed: () => setState(() {
                        _stops.removeAt(i).dispose();
                      }),
                    ),
            ),
          ),
          const SizedBox(height: 10),
        ],
        if (_errors['stops'] != null) _ErrorLine(_errors['stops']!),
        if (_stops.length < 8)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () =>
                  setState(() => _stops.add(TextEditingController())),
              icon: const Icon(Icons.add),
              label: const Text('Add stop'),
            ),
          ),
        const SizedBox(height: 6),
        TextField(
          controller: _waiting,
          inputFormatters: [LengthLimitingTextInputFormatter(40)],
          decoration: const InputDecoration(
            labelText: 'Waiting time (optional)',
            hintText: 'e.g. 2 hours',
            prefixIcon: Icon(Icons.hourglass_empty_rounded),
          ),
        ),
      ] else
        TextField(
          key: const Key('nb-drop'),
          controller: _drop,
          textCapitalization: TextCapitalization.words,
          inputFormatters: [LengthLimitingTextInputFormatter(100)],
          onChanged: (_) => setState(() => _errors.remove('drop')),
          decoration: InputDecoration(
            labelText: dropLabel,
            prefixIcon: const Icon(Icons.flag_outlined),
            errorText: _errors['drop'],
          ),
        ),
      if (type == TripType.selfDrive) ...[
        const SizedBox(height: 22),
        const MSectionLabel('Handover'),
        TextField(
          key: const Key('nb-deposit'),
          controller: _deposit,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
          ],
          decoration: InputDecoration(
            labelText: 'Security deposit (optional)',
            prefixText: '₹ ',
            prefixIcon: const Icon(Icons.shield_outlined),
            errorText: _errors['deposit'],
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('nb-start-km'),
          controller: _startKm,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
          ],
          decoration: InputDecoration(
            labelText: 'Start odometer km (optional)',
            prefixIcon: const Icon(Icons.speed_outlined),
            errorText: _errors['startKm'],
          ),
        ),
      ],
    ]);
  }

  // ── Step 4: vehicle & driver ───────────────────────────────────────────────

  Widget _vehicleStep(HomeTokens t) {
    final type = _type!;
    final range = _range!;
    final busyAsync = ref.watch(managerBusyProvider(range));
    final vehiclesAsync = ref.watch(managerVehiclesProvider);
    final driversAsync = ref.watch(managerDriversProvider);
    final rangeText = range.start == range.end
        ? _dateFmt.format(range.start)
        : '${DateFormat('d MMM').format(range.start)} – ${_dateFmt.format(range.end)}';

    Widget retry(Object e) => MError(
      error: e,
      onRetry: () {
        ref.invalidate(managerBusyProvider(range));
        ref.invalidate(managerVehiclesProvider);
        ref.invalidate(managerDriversProvider);
      },
    );

    final error = busyAsync.error ?? vehiclesAsync.error ?? driversAsync.error;
    if (error != null) {
      return _page([
        _StepIntro(title: 'Vehicle and driver', subtitle: rangeText),
        retry(error),
      ]);
    }
    if (!busyAsync.hasValue ||
        !vehiclesAsync.hasValue ||
        !driversAsync.hasValue) {
      return _page([
        _StepIntro(title: 'Vehicle and driver', subtitle: rangeText),
        const MLoading(height: 240),
      ]);
    }
    final busy = busyAsync.value!;
    final vehicles = vehiclesAsync.value!
        .where((v) => v.status == 'active')
        .toList();
    final drivers = driversAsync.value!
        .where((d) => d.status == 'active')
        .toList();
    // A selection made earlier may have been booked since.
    if (_vehicle != null && busy.vehicleIds.contains(_vehicle!.id)) {
      _vehicle = null;
    }
    if (_driver != null && busy.driverIds.contains(_driver!.id)) {
      _driver = null;
    }
    final assigned = !type.needsDriver || _driver != null;

    return _page([
      _StepIntro(title: 'Vehicle and driver', subtitle: rangeText),
      MSectionLabel(
        'Vehicle',
        trailing: Text(
          '${vehicles.where((v) => !busy.vehicleIds.contains(v.id)).length} free',
          style: TextStyle(fontSize: 13, color: t.textSecondary),
        ),
      ),
      if (_errors['vehicle'] != null) _ErrorLine(_errors['vehicle']!),
      if (vehicles.isEmpty)
        const MEmpty(
          icon: Icons.directions_car_outlined,
          title: 'No active vehicles',
          message: 'Mark a vehicle active on the web ERP first.',
        ),
      for (final v in vehicles) ...[
        _OptionTile(
          key: Key('nb-vehicle-${v.id}'),
          icon: Icons.directions_car_filled_outlined,
          title: v.registration,
          subtitle: [
            v.makeModel,
            titleCase(v.vehicleType),
          ].where((s) => s != null && s.isNotEmpty).join(' · '),
          selected: _vehicle?.id == v.id,
          booked: busy.vehicleIds.contains(v.id),
          onTap: () => setState(() {
            _vehicle = v;
            _errors.remove('vehicle');
          }),
        ),
        const SizedBox(height: 8),
      ],
      const SizedBox(height: 16),
      if (!type.needsDriver)
        MCard(
          color: t.neutralSurface,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.key_outlined, color: t.textSecondary),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Self drive — no driver is assigned. Check the customer\'s '
                  'driving licence before handing over the vehicle.',
                  style: TextStyle(
                    fontSize: 13,
                    color: t.textPrimary,
                    height: 1.35,
                  ),
                ),
              ),
            ],
          ),
        )
      else ...[
        const MSectionLabel('Driver (optional)'),
        _OptionTile(
          key: const Key('nb-driver-none'),
          icon: Icons.person_off_outlined,
          title: 'No driver yet',
          subtitle: 'Saved as draft — assign from the trip page later',
          selected: _driver == null,
          booked: false,
          onTap: () => setState(() => _driver = null),
        ),
        const SizedBox(height: 8),
        for (final d in drivers) ...[
          _OptionTile(
            key: Key('nb-driver-${d.id}'),
            icon: Icons.person_outline,
            title: d.name,
            subtitle: d.phone ?? '',
            selected: _driver?.id == d.id,
            booked: busy.driverIds.contains(d.id),
            onTap: () => setState(() => _driver = d),
          ),
          const SizedBox(height: 8),
        ],
      ],
      const SizedBox(height: 8),
      _StatusNote(assigned: assigned, selfDrive: _type == TripType.selfDrive),
    ]);
  }

  // ── Step 5: fare & review ──────────────────────────────────────────────────

  Widget _reviewStep(HomeTokens t) {
    final draft = _draft();
    final fare = draft.totalFare;
    final adv = draft.advance;
    final when = [
      _dateFmt.format(draft.startDate),
      if (draft.startTime != null) managerClock(draft.startTime),
    ].join(', ');
    final last = draft.lastDay;
    final endText = last.isAfter(_day(draft.startDate)) || draft.endTime != null
        ? [
            _dateFmt.format(last),
            if (draft.endTime != null) managerClock(draft.endTime),
          ].join(', ')
        : null;
    final route = [
      draft.pickupLocation,
      draft.dropLocation,
    ].where((s) => s != null).join('  →  ');
    final month = DateFormat(
      'MMM',
      'en_US',
    ).format(draft.startDate).toUpperCase();

    return _page([
      const _StepIntro(
        title: 'Fare and review',
        subtitle: 'Check everything before creating the booking.',
      ),
      const MSectionLabel('Fare'),
      TextField(
        key: const Key('nb-fare'),
        controller: _fare,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
        onChanged: (_) => setState(() => _errors.remove('fare')),
        decoration: InputDecoration(
          labelText: 'Total fare (optional)',
          prefixText: '₹ ',
          prefixIcon: const Icon(Icons.currency_rupee_rounded),
          errorText: _errors['fare'],
        ),
      ),
      const SizedBox(height: 12),
      TextField(
        key: const Key('nb-advance'),
        controller: _advance,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
        onChanged: (_) => setState(() => _errors.remove('advance')),
        decoration: InputDecoration(
          labelText: 'Advance received (optional)',
          prefixText: '₹ ',
          prefixIcon: const Icon(Icons.savings_outlined),
          errorText: _errors['advance'],
        ),
      ),
      const SizedBox(height: 12),
      TextField(
        key: const Key('nb-notes'),
        controller: _notes,
        minLines: 2,
        maxLines: 4,
        textCapitalization: TextCapitalization.sentences,
        inputFormatters: [LengthLimitingTextInputFormatter(300)],
        decoration: const InputDecoration(
          labelText: 'Notes (optional)',
          alignLabelWithHint: true,
        ),
      ),
      const SizedBox(height: 22),
      MSectionLabel('Summary', trailing: StatusChip(status: draft.status)),
      MCard(
        child: Column(
          children: [
            _SummaryRow(
              'Booking no.',
              '${bookingFyPrefix(draft.startDate)}$month-····',
              hint: 'assigned on create',
            ),
            _SummaryRow('Trip type', draft.type.label, onEdit: () => _jump(0)),
            _SummaryRow('Customer', draft.customerName, onEdit: () => _jump(1)),
            _SummaryRow(
              'Mobile',
              draft.customerContact == null
                  ? '—'
                  : '+91 ${draft.customerContact}',
              onEdit: () => _jump(1),
            ),
            _SummaryRow(
              draft.type.isRental ? 'Pickup' : 'Starts',
              when,
              onEdit: () => _jump(2),
            ),
            if (endText != null)
              _SummaryRow(
                draft.type.isRental || draft.type == TripType.roundTrip
                    ? 'Return'
                    : 'Ends',
                endText,
                onEdit: () => _jump(2),
              ),
            if (route.isNotEmpty)
              _SummaryRow('Route', route, onEdit: () => _jump(2)),
            if (draft.waitingTime?.trim().isNotEmpty ?? false)
              _SummaryRow('Waiting', draft.waitingTime!.trim()),
            if (draft.securityDeposit != null)
              _SummaryRow('Deposit', inr.format(draft.securityDeposit)),
            if (draft.startKm != null)
              _SummaryRow('Start km', draft.startKm!.toStringAsFixed(0)),
            _SummaryRow(
              'Vehicle',
              draft.vehicle.registration,
              onEdit: () => _jump(3),
            ),
            _SummaryRow(
              'Driver',
              draft.type.needsDriver
                  ? (draft.effectiveDriver?.name ?? 'Not assigned')
                  : 'Self drive',
              onEdit: () => _jump(3),
            ),
            _SummaryRow('Fare', fare == null ? '—' : inr.format(fare)),
            if (adv != null) _SummaryRow('Advance', inr.format(adv)),
            if (fare != null && adv != null)
              _SummaryRow('Balance', inr.format(draft.balance), last: true)
            else
              _SummaryRow('Status', titleCase(draft.status), last: true),
          ],
        ),
      ),
      const SizedBox(height: 12),
      _StatusNote(
        assigned: draft.status == 'assigned',
        selfDrive: draft.type == TripType.selfDrive,
      ),
    ]);
  }
}

// ── Pieces ───────────────────────────────────────────────────────────────────

class _StepHeader extends StatelessWidget {
  const _StepHeader({
    required this.step,
    required this.reached,
    required this.onTap,
  });

  final int step;
  final int reached;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
      child: Row(
        children: [
          for (var i = 0; i < _stepLabels.length; i++)
            Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: i <= reached ? () => onTap(i) : null,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Container(
                              height: 2,
                              color: i == 0
                                  ? Colors.transparent
                                  : (i <= step ? t.primary : t.cardBorder),
                            ),
                          ),
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            width: 28,
                            height: 28,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: i < step
                                  ? t.primary
                                  : (i == step ? t.primary : t.card),
                              border: Border.all(
                                color: i <= step ? t.primary : t.cardBorder,
                                width: 1.5,
                              ),
                            ),
                            child: i < step
                                ? const Icon(
                                    Icons.check_rounded,
                                    size: 16,
                                    color: Colors.white,
                                  )
                                : Text(
                                    '${i + 1}',
                                    style: TextStyle(
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w700,
                                      color: i == step
                                          ? Colors.white
                                          : t.textSecondary,
                                    ),
                                  ),
                          ),
                          Expanded(
                            child: Container(
                              height: 2,
                              color: i == _stepLabels.length - 1
                                  ? Colors.transparent
                                  : (i < step ? t.primary : t.cardBorder),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        _stepLabels[i],
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: i == step
                              ? FontWeight.w700
                              : FontWeight.w500,
                          color: i == step ? t.textPrimary : t.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _StepIntro extends StatelessWidget {
  const _StepIntro({required this.title, required this.subtitle});
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.4,
              color: t.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: TextStyle(fontSize: 13.5, color: t.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _TypeCard extends StatelessWidget {
  const _TypeCard({
    required this.type,
    required this.selected,
    required this.onTap,
  });

  final TripType type;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Semantics(
      selected: selected,
      button: true,
      child: MCard(
        key: Key('nb-type-${type.value}'),
        onTap: onTap,
        borderColor: selected ? t.primary : null,
        color: selected ? t.primary.withValues(alpha: 0.06) : null,
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: selected ? t.primary : t.neutralSurface,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                tripTypeIcon(type),
                color: selected ? Colors.white : t.textSecondary,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    type.label,
                    style: TextStyle(
                      fontSize: 15.5,
                      fontWeight: FontWeight.w700,
                      color: t.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    type.description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12.5, color: t.textSecondary),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(
              selected
                  ? Icons.check_circle_rounded
                  : Icons.radio_button_unchecked,
              color: selected ? t.primary : t.cardBorder,
            ),
          ],
        ),
      ),
    );
  }
}

class _OptionTile extends StatelessWidget {
  const _OptionTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.booked,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool selected;
  final bool booked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final danger = Theme.of(context).colorScheme.error;
    return Opacity(
      opacity: booked ? 0.55 : 1,
      child: MCard(
        onTap: booked ? null : onTap,
        borderColor: selected ? t.primary : null,
        color: selected ? t.primary.withValues(alpha: 0.06) : null,
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
        child: Row(
          children: [
            Icon(icon, color: selected ? t.primary : t.textSecondary),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: t.textPrimary,
                    ),
                  ),
                  if (subtitle.isNotEmpty)
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12.5, color: t.textSecondary),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            if (booked)
              MTag(
                label: 'Booked',
                color: danger,
                icon: Icons.event_busy_outlined,
              )
            else
              Icon(
                selected
                    ? Icons.check_circle_rounded
                    : Icons.radio_button_unchecked,
                color: selected ? t.primary : t.cardBorder,
              ),
          ],
        ),
      ),
    );
  }
}

class _StatusNote extends StatelessWidget {
  const _StatusNote({required this.assigned, this.selfDrive = false});
  final bool assigned;
  final bool selfDrive;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final color = assigned ? t.success : t.warning;
    return MCard(
      color: color.withValues(alpha: 0.08),
      borderColor: color.withValues(alpha: 0.35),
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            assigned
                ? Icons.assignment_turned_in_outlined
                : Icons.edit_note_rounded,
            color: color,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              assigned
                  ? (selfDrive
                        ? 'Saved as Assigned — the vehicle is reserved for '
                              'the customer.'
                        : 'Saved as Assigned — the driver sees this trip in '
                              'their app.')
                  : 'Saved as Draft — no driver yet. Assign one from the trip '
                        'page when ready.',
              style: TextStyle(
                fontSize: 13,
                color: t.textPrimary,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow(
    this.label,
    this.value, {
    this.hint,
    this.onEdit,
    this.last = false,
  });

  final String label;
  final String value;
  final String? hint;
  final VoidCallback? onEdit;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 9),
      decoration: BoxDecoration(
        border: last ? null : Border(bottom: BorderSide(color: t.cardBorder)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 92,
            child: Text(
              label,
              style: TextStyle(fontSize: 13, color: t.textSecondary),
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: t.textPrimary,
                  ),
                ),
                if (hint != null)
                  Text(
                    hint!,
                    style: TextStyle(fontSize: 11.5, color: t.textSecondary),
                  ),
              ],
            ),
          ),
          if (onEdit != null)
            InkWell(
              onTap: onEdit,
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.all(2),
                child: Icon(
                  Icons.edit_outlined,
                  size: 16,
                  color: t.textSecondary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _PickerField extends StatelessWidget {
  const _PickerField({
    super.key,
    required this.label,
    required this.icon,
    required this.value,
    required this.placeholder,
    required this.onTap,
    this.error,
    this.onClear,
  });

  final String label;
  final IconData icon;
  final String? value;
  final String placeholder;
  final VoidCallback onTap;
  final String? error;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: InputDecorator(
        isEmpty: false,
        decoration: InputDecoration(
          labelText: label,
          prefixIcon: Icon(icon),
          errorText: error,
          suffixIcon: onClear == null
              ? const Icon(Icons.expand_more_rounded)
              : IconButton(
                  tooltip: 'Clear',
                  icon: const Icon(Icons.close_rounded),
                  onPressed: onClear,
                ),
        ),
        child: Text(
          value ?? placeholder,
          style: TextStyle(
            fontSize: 15,
            color: value == null ? t.textSecondary : t.textPrimary,
          ),
        ),
      ),
    );
  }
}

class _ErrorLine extends StatelessWidget {
  const _ErrorLine(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme.error;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(Icons.error_outline, size: 16, color: c),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 12.5,
                color: c,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Searchable list of previous customers (distinct name + contact).
class _CustomerPickerSheet extends ConsumerStatefulWidget {
  const _CustomerPickerSheet();

  @override
  ConsumerState<_CustomerPickerSheet> createState() =>
      _CustomerPickerSheetState();
}

class _CustomerPickerSheetState extends ConsumerState<_CustomerPickerSheet> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final async = ref.watch(managerRecentCustomersProvider);
    final height = MediaQuery.sizeOf(context).height * 0.75;
    return SizedBox(
      height: height,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Previous customers',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: t.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    key: const Key('nb-customer-search'),
                    autofocus: false,
                    onChanged: (v) =>
                        setState(() => _q = v.trim().toLowerCase()),
                    decoration: const InputDecoration(
                      hintText: 'Search name or mobile',
                      prefixIcon: Icon(Icons.search),
                      isDense: true,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: async.when(
                loading: () => const MLoading(),
                error: (e, _) => Padding(
                  padding: const EdgeInsets.all(20),
                  child: MError(
                    error: e,
                    onRetry: () =>
                        ref.invalidate(managerRecentCustomersProvider),
                  ),
                ),
                data: (all) {
                  final list = all
                      .where(
                        (c) =>
                            _q.isEmpty ||
                            c.name.toLowerCase().contains(_q) ||
                            (c.contact ?? '').contains(_q),
                      )
                      .toList();
                  if (list.isEmpty) {
                    return const Padding(
                      padding: EdgeInsets.all(20),
                      child: MEmpty(
                        icon: Icons.person_search_outlined,
                        title: 'No matching customers',
                        message: 'Close this and type the details instead.',
                      ),
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 20),
                    itemCount: list.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 2),
                    itemBuilder: (_, i) {
                      final c = list[i];
                      return ListTile(
                        key: Key('nb-customer-$i'),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        leading: CircleAvatar(
                          backgroundColor: t.neutralSurface,
                          child: Text(
                            c.name.characters.first.toUpperCase(),
                            style: TextStyle(
                              color: t.textPrimary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        title: Text(
                          c.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: Text(
                          [
                            c.contact == null
                                ? 'No mobile'
                                : '+91 ${c.contact}',
                            if (c.lastTrip != null)
                              'last ${DateFormat('d MMM yyyy').format(c.lastTrip!)}',
                          ].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        onTap: () => Navigator.pop(context, c),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
