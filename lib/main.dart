import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/config/app_config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await dotenv.load();

  await Supabase.initialize(
    url: AppConfig.supabaseUrl,
    anonKey: AppConfig.supabaseAnonKey,
  );

  runApp(const ManaApp());
}

class ManaApp extends StatelessWidget {
  const ManaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Mana',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF4A148C)),
        useMaterial3: true,
      ),
      home: const ConnectionCheckPage(),
    );
  }
}

/// Schermata temporanea che verifica la connessione a Supabase.
/// Verra' sostituita dall'onboarding/login nella Fase 6.
class ConnectionCheckPage extends StatefulWidget {
  const ConnectionCheckPage({super.key});

  @override
  State<ConnectionCheckPage> createState() => _ConnectionCheckPageState();
}

class _ConnectionCheckPageState extends State<ConnectionCheckPage> {
  late final SupabaseClient _supabase = Supabase.instance.client;
  String _status = 'In attesa...';
  bool _ok = false;

  @override
  void initState() {
    super.initState();
    _checkConnection();
  }

  Future<void> _checkConnection() async {
    try {
      // La sessione iniziale e' null per un utente non autenticato, ma il fatto
      // che la chiamata non lanci eccezioni dimostra che il client e'
      // inizializzato correttamente.
      final session = _supabase.auth.currentSession;
      setState(() {
        _ok = true;
        _status = session == null
            ? 'Connesso a Supabase (nessun utente autenticato)'
            : 'Connesso a Supabase (utente: ${session.user.email})';
      });
    } catch (e) {
      setState(() {
        _ok = false;
        _status = 'Errore di connessione: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mana')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                _ok ? Icons.check_circle : Icons.hourglass_empty,
                size: 64,
                color: _ok ? Colors.green : Colors.grey,
              ),
              const SizedBox(height: 16),
              Text(
                _status,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 32),
              Text(
                'Setup Supabase — Fase 2',
                style: Theme.of(
                  context,
                ).textTheme.labelMedium?.copyWith(color: Colors.grey),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
