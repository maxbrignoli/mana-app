import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../generated/l10n/app_localizations.dart';

/// Placeholder della schermata di gioco. La UI vera (chat con Mana, gestione
/// turni, contatori) e' nel prossimo PR (#3 della Fase 8).
///
/// Per ora mostra solo l'ID della partita ricevuto dalla navigazione, cosi'
/// possiamo verificare end-to-end che start funzioni davvero contro il
/// backend reale.
class GameScreen extends StatelessWidget {
  final String gameId;

  /// Dati di start passati dalla schermata precedente via `extra`.
  /// Conterra' qualcosa come `{ game: {...}, firstManaMove: {...} }`.
  /// Null se l'utente apre direttamente la rotta o ricarica la pagina:
  /// la schermata vera dovra' fare un GET di fallback.
  final Map<String, dynamic>? initialState;

  const GameScreen({super.key, required this.gameId, this.initialState});

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final game = initialState?['game'] as Map<String, dynamic>?;
    final firstMove = initialState?['firstManaMove'] as Map<String, dynamic>?;

    return Scaffold(
      appBar: AppBar(
        title: Text(l.appName),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => context.go('/home'),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Game ID', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 4),
            SelectableText(
              gameId,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 24),
            if (game != null) ...[
              Text('Game', style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: 4),
              SelectableText(
                game.toString(),
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 24),
            ],
            if (firstMove != null) ...[
              Text(
                'First Mana move',
                style: Theme.of(context).textTheme.labelLarge,
              ),
              const SizedBox(height: 4),
              SelectableText(
                (firstMove['content'] as String?) ?? firstMove.toString(),
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
