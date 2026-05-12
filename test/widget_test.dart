// Test di base per ManaApp.
//
// Verifica solo che il widget root si costruisca senza errori.
// Nota: l'inizializzazione completa di Supabase richiede un .env e non viene
// testata qui — i test di integrazione live verranno aggiunti nelle fasi
// successive.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('Smoke test: MaterialApp si costruisce', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          appBar: AppBar(title: const Text('Mana')),
          body: const Center(child: Text('test')),
        ),
      ),
    );

    expect(find.text('Mana'), findsOneWidget);
    expect(find.text('test'), findsOneWidget);
  });
}
