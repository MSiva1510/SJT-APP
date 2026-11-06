import 'package:flutter/material.dart';

class DirectoryEditorField {
  const DirectoryEditorField(
    this.key,
    this.label, {
    this.initialValue,
    this.required = false,
    this.keyboardType,
    this.options,
  });

  final String key;
  final String label;
  final String? initialValue;
  final bool required;
  final TextInputType? keyboardType;
  final Map<String, String>? options;
}

Future<Map<String, Object?>?> showDirectoryRecordEditor(
  BuildContext context, {
  required String title,
  required List<DirectoryEditorField> fields,
}) async {
  return showModalBottomSheet<Map<String, Object?>>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _DirectoryRecordEditorSheet(title: title, fields: fields),
  );
}

class _DirectoryRecordEditorSheet extends StatefulWidget {
  const _DirectoryRecordEditorSheet({
    required this.title,
    required this.fields,
  });

  final String title;
  final List<DirectoryEditorField> fields;

  @override
  State<_DirectoryRecordEditorSheet> createState() =>
      _DirectoryRecordEditorSheetState();
}

class _DirectoryRecordEditorSheetState
    extends State<_DirectoryRecordEditorSheet> {
  final _formKey = GlobalKey<FormState>();
  late final Map<String, TextEditingController> _controllers = {
    for (final field in widget.fields)
      field.key: TextEditingController(text: field.initialValue ?? ''),
  };

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.88,
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          widget.title,
                          style: Theme.of(context).textTheme.titleLarge
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                      ),
                      IconButton(
                        key: const Key('directory-record-close'),
                        tooltip: 'Close',
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  for (final field in widget.fields)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: field.options != null
                          ? DropdownButtonFormField<String>(
                              key: Key('directory-field-${field.key}'),
                              initialValue:
                                  field.options!.containsKey(
                                    _controllers[field.key]!.text,
                                  )
                                  ? _controllers[field.key]!.text
                                  : null,
                              decoration: InputDecoration(
                                labelText: field.label,
                              ),
                              items: [
                                for (final option in field.options!.entries)
                                  DropdownMenuItem(
                                    value: option.key,
                                    child: Text(option.value),
                                  ),
                              ],
                              onChanged: (value) =>
                                  _controllers[field.key]!.text = value ?? '',
                              validator: (value) =>
                                  field.required && (value?.isEmpty ?? true)
                                  ? 'Select ${field.label.toLowerCase()}'
                                  : null,
                            )
                          : TextFormField(
                              key: Key('directory-field-${field.key}'),
                              controller: _controllers[field.key],
                              keyboardType: field.keyboardType,
                              decoration: InputDecoration(
                                labelText: field.label,
                                hintText:
                                    field.key.endsWith('_expiry') ||
                                        field.key.endsWith('_date')
                                    ? 'YYYY-MM-DD'
                                    : null,
                              ),
                              validator: (value) =>
                                  field.required &&
                                      (value?.trim().isEmpty ?? true)
                                  ? 'Enter ${field.label.toLowerCase()}'
                                  : null,
                            ),
                    ),
                  const SizedBox(height: 4),
                  FilledButton(
                    key: const Key('directory-record-save'),
                    onPressed: () {
                      if (!_formKey.currentState!.validate()) return;
                      Navigator.pop(context, {
                        for (final field in widget.fields)
                          field.key: _cleanDirectoryValue(
                            _controllers[field.key]!.text,
                          ),
                      });
                    },
                    child: const Text('Save'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

String? _cleanDirectoryValue(String value) {
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}

Future<bool> confirmDirectoryDelete(
  BuildContext context, {
  required String title,
  required String message,
}) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    ) ??
    false;
