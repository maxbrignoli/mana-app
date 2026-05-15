import 'package:flutter/material.dart';

/// Placeholder della schermata di login.
///
/// Verra' sostituito nel PR #2 (auth email/password) e PR #3 (auth social).
/// Per ora mostra solo un messaggio e un bottone temporaneo che dovrebbe
/// portare alla home (utile per testare il routing finche' non c'e' auth vera).
class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mana — Login')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                'Schermata di login',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              Text(
                'Placeholder. Verra sostituita nei prossimi PR.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
