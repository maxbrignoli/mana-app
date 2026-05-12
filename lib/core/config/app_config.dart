import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Configurazione dell'applicazione caricata da variabili d'ambiente.
///
/// Le variabili sono lette dal file `.env` alla radice del progetto
/// tramite il package `flutter_dotenv`. Il file `.env` non e' versionato
/// (vedi `.gitignore`) — usare `.env.example` come template.
class AppConfig {
  AppConfig._();

  /// URL del progetto Supabase.
  static String get supabaseUrl => _required('SUPABASE_URL');

  /// Chiave pubblica (anon/publishable) di Supabase, sicura da esporre
  /// nel client mobile.
  static String get supabaseAnonKey => _required('SUPABASE_ANON_KEY');

  static String _required(String key) {
    final value = dotenv.env[key];
    if (value == null || value.isEmpty) {
      throw StateError(
        'Variabile d\'ambiente mancante o vuota: $key. '
        'Verifica il file .env alla radice del progetto.',
      );
    }
    return value;
  }
}
