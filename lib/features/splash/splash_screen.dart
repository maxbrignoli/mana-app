import 'package:flutter/material.dart';

/// Schermata di splash mostrata all'avvio mentre il router decide dove
/// reindirizzare (login se non autenticato, home altrimenti).
///
/// In futuro qui andra' la transizione di apertura con Mana animata.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.auto_awesome,
              size: 80,
              color: Color(0xFF4A148C),
            ),
            const SizedBox(height: 16),
            Text(
              'Mana',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: const Color(0xFF4A148C),
                  ),
            ),
            const SizedBox(height: 24),
            const CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
