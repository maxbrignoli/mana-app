import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Placeholder della home schermata visibile dopo il login.
///
/// Per ora mostra l'email dell'utente autenticato e un bottone di logout
/// per consentire di verificare il flusso di routing auth-aware.
/// Verra' sostituita da una vera home (con gioco, gemme, profilo) nei
/// prossimi PR della Fase 6 e oltre.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = Supabase.instance.client.auth.currentSession;
    final email = session?.user.email ?? '(no email)';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mana'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Logout',
            onPressed: () async {
              await Supabase.instance.client.auth.signOut();
            },
          ),
        ],
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'Ciao!',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 8),
            Text(
              email,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 16),
            Text(
              'Placeholder home. Costruiremo il gioco qui nei prossimi PR.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
