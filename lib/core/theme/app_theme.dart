import 'package:flutter/material.dart';

/// Theme dell'applicazione.
///
/// Per ora un theme Material 3 minimale con palette viola di base
/// (coerente con l'identita' di Mana come maga apprendista). L'identita'
/// visiva completa (Art Nouveau, tarocchi, design system) arrivera' nella
/// Fase 7 ed e' destinata a sostituire questo file.
///
/// Tenere questo file piccolo e isolato facilita la sostituzione futura.
class AppTheme {
  AppTheme._();

  /// Seme della palette: viola scuro, ispirato al mantello di Mana.
  static const Color _seedColor = Color(0xFF4A148C);

  /// Theme principale (light). Material 3 + ColorScheme.fromSeed.
  static ThemeData get light => ThemeData(
    colorScheme: ColorScheme.fromSeed(seedColor: _seedColor),
    useMaterial3: true,
    // Densita' visiva confortevole su mobile.
    visualDensity: VisualDensity.adaptivePlatformDensity,
  );

  /// Theme dark, per completezza. Stesso seme.
  static ThemeData get dark => ThemeData(
    colorScheme: ColorScheme.fromSeed(
      seedColor: _seedColor,
      brightness: Brightness.dark,
    ),
    useMaterial3: true,
    visualDensity: VisualDensity.adaptivePlatformDensity,
  );
}
