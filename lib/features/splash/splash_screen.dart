import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Schermata di splash mostrata all'avvio dell'app.
///
/// Comportamento:
/// - Se l'utente ha gia' una sessione Supabase valida (residua dal precedente
///   avvio), il router redirige a /home automaticamente.
/// - Altrimenti facciamo subito un signInAnonymously() per dargli un'identita'
///   ospite. Il backend, tramite trigger DB, ha gia' creato un profilo +
///   balance gemme per lui. Poi navigamo a /home.
///
/// In caso di errore del signInAnonymously() (es. offline al primo lancio),
/// mostriamo un piccolo bottone "Riprova" invece di lasciare lo splash bloccato.
///
/// In futuro qui andra' la transizione di apertura con Mana animata (Fase 7).
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  String? _errorMessage;
  bool _attempting = false;

  @override
  void initState() {
    super.initState();
    // Differiamo al frame successivo per essere sicuri che il router sia attivo
    // prima di provare a chiamare context.go.
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _bootstrap() async {
    if (_attempting) return;
    setState(() {
      _attempting = true;
      _errorMessage = null;
    });

    final supabase = Supabase.instance.client;

    // Se gia' loggato (sessione persistita), il router fara' redirect.
    if (supabase.auth.currentSession != null) {
      return;
    }

    try {
      await supabase.auth.signInAnonymously();
      // Il listener auth del router rifa' il redirect verso /home automaticamente.
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _attempting = false;
        _errorMessage = 'Impossibile avviare la sessione: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.auto_awesome, size: 80, color: Color(0xFF4A148C)),
            const SizedBox(height: 16),
            Text(
              'Mana',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.bold,
                color: const Color(0xFF4A148C),
              ),
            ),
            const SizedBox(height: 24),
            if (_errorMessage == null) ...[
              const CircularProgressIndicator(),
            ] else ...[
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Text(
                  _errorMessage!,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.error,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              FilledButton(onPressed: _bootstrap, child: const Text('Riprova')),
            ],
          ],
        ),
      ),
    );
  }
}
