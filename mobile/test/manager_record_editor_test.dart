import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:sri_jayam_travels_mobile/widgets/manager/manager_record_editor.dart';

void main() {
  testWidgets('directory editor is a mobile bottom sheet and saves values', (
    tester,
  ) async {
    Map<String, Object?>? result;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: ElevatedButton(
              onPressed: () async {
                result = await showDirectoryRecordEditor(
                  context,
                  title: 'Add driver',
                  fields: const [
                    DirectoryEditorField('name', 'Name', required: true),
                  ],
                );
              },
              child: const Text('Open editor'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open editor'));
    await tester.pumpAndSettle();
    expect(find.byType(BottomSheet), findsOneWidget);

    await tester.tap(find.byKey(const Key('directory-record-save')));
    await tester.pumpAndSettle();
    expect(find.text('Enter name'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('directory-field-name')),
      'Arun Kumar',
    );
    await tester.tap(find.byKey(const Key('directory-record-save')));
    await tester.pumpAndSettle();
    expect(result, {'name': 'Arun Kumar'});
  });

  testWidgets('directory editor closes from its top-right close button', (
    tester,
  ) async {
    var dismissed = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: ElevatedButton(
              onPressed: () async {
                final result = await showDirectoryRecordEditor(
                  context,
                  title: 'Add vehicle',
                  fields: const [],
                );
                dismissed = result == null;
              },
              child: const Text('Open editor'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open editor'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('directory-record-close')));
    await tester.pumpAndSettle();

    expect(dismissed, isTrue);
  });
}
