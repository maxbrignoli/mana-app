import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Configurazione dell'applicazione caricata da variabili d'ambiente.
///
/// Le variabili sono lette dal file `.env` alla radice del progetto
/// tramite il package `flutter_dotenv`. Il file `.env` non e' versionato
/// (vedi `.gitignore`) — usare `.env.example` come template.
///
/// Tutti i valori esposti qui devono essere "pubblici" rispetto al client
/// mobile: la app verra' distribuita su store e qualsiasi valore qui dentro
/// e' di fatto pubblico. Tipicamente: URL del backend, chiavi pubbliche di
/// Supabase, ecc. NIENTE chiavi private (service role, OPENAI_API_KEY, ecc.):
/// quelle vivono solo sui server Vercel.
class AppConfig {
  AppConfig._();

  /// URL del progetto Supabase.
  static String get supabaseUrl => _required('SUPABASE_URL');

  /// Chiave pubblica (anon/publishable) di Supabase, sicura da esporre
  /// nel client mobile.
  static String get supabaseAnonKey => _required('SUPABASE_ANON_KEY');

  /// Base URL del backend Vercel. Esempi:
  /// - dev locale:    `http://localhost:3000`
  /// - preview vercel: `https://mana-app-git-NOMEBRANCH.vercel.app`
  /// - production:    `https://mana-app.vercel.app`
  ///
  /// Non deve terminare con uno slash.
  static String get backendBaseUrl {
    final raw = _required('BACKEND_BASE_URL');
    return raw.endsWith('/') ? raw.substring(0, raw.length - 1) : raw;
  }

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
