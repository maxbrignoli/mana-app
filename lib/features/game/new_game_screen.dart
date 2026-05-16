import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/mana_api.dart';
import '../../generated/l10n/app_localizations.dart';
import '../../main.dart' show gameApi, manaApi;
import 'game_domains.dart';
import 'game_types.dart';

/// Schermata di scelta dei parametri di una nuova partita single player.
///
/// Layout (dall'alto in basso):
/// 1. Scelta della modalita' (manaGuesses / userGuesses): due card a scelta
///    singola.
/// 2. Scelta dei domini (solo se modalita' = userGuesses): chip multi-select.
///    In manaGuesses i domini non servono - Mana indaga alla cieca.
/// 3. Scelta della difficolta': tre bottoni a chip.
/// 4. Bottone "Inizia": chiama gameApi.startSingleGame e naviga alla
///    schermata di gioco. Il costo (1 gemma) e' segnalato sotto.
///
/// Default:
/// - modalita': userGuesses (gioco classico, l'utente fa le domande)
/// - difficolta': profile.preferred_difficulty (medium se non disponibile)
/// - domini: tutti deselezionati (l'utente sceglie esplicitamente)
///
/// Cultures: vengono prese da profile.cultures e passate al backend senza
/// che l'utente debba pensarci.
class NewGameScreen extends StatefulWidget {
  const NewGameScreen({super.key});

  @override
  State<NewGameScreen> createState() => _NewGameScreenState();
}

class _NewGameScreenState extends State<NewGameScreen> {
  Future<Map<String, dynamic>>? _meFuture;

  SingleGameMode _mode = SingleGameMode.userGuesses;
  final Set<String> _selectedDomains = <String>{};
  Difficulty _difficulty = Difficulty.medium;
  bool _starting = false;

  // Cultures vengono dal profilo: di default ['it'] dal DB.
  List<String> _cultures = const ['it'];

  @override
  void initState() {
    super.initState();
    _meFuture = manaApi.getMe();
    _meFuture!
        .then((data) {
          if (!mounted) return;
          final profile = (data['profile'] as Map?) ?? const {};
          final pref = profile['preferred_difficulty'] as String?;
          final cultures = (profile['cultures'] as List?)
              ?.whereType<String>()
              .toList();
          setState(() {
            if (pref != null) {
              _difficulty = Difficulty.values.firstWhere(
                (d) => d.wireValue == pref,
                orElse: () => Difficulty.medium,
              );
            }
            if (cultures != null && cultures.isNotEmpty) {
              _cultures = cultures;
            }
          });
        })
        .catchError((_) {
          // Se /api/me fallisce restiamo sui default; non blocchiamo la UI.
          // L'errore di /me e' gia' visibile altrove (Home/Account).
        });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final canStart =
        !_starting &&
        (_mode == SingleGameMode.manaGuesses || _selectedDomains.isNotEmpty);

    return Scaffold(
      appBar: AppBar(
        title: Text(l.gameNewTitle),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/home'),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          _SectionTitle(text: l.gameModeSection),
          const SizedBox(height: 8),
          _ModeCard(
            mode: SingleGameMode.userGuesses,
            selected: _mode == SingleGameMode.userGuesses,
            icon: Icons.question_mark,
            title: l.gameModeUserGuesses,
            description: l.gameModeUserGuessesDescription,
            onTap: () => setState(() => _mode = SingleGameMode.userGuesses),
          ),
          const SizedBox(height: 12),
          _ModeCard(
            mode: SingleGameMode.manaGuesses,
            selected: _mode == SingleGameMode.manaGuesses,
            icon: Icons.psychology,
            title: l.gameModeManaGuesses,
            description: l.gameModeManaGuessesDescription,
            onTap: () => setState(() => _mode = SingleGameMode.manaGuesses),
          ),

          // Domini: visibili solo in userGuesses. AnimatedSize per uno
          // slide-in pulito quando l'utente cambia modalita'.
          AnimatedSize(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeInOut,
            alignment: Alignment.topCenter,
            child: _mode == SingleGameMode.userGuesses
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 24),
                      _SectionTitle(text: l.gameDomainsSection),
                      const SizedBox(height: 4),
                      Text(
                        l.gameDomainsHint,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: kGameDomains.map((d) {
                          final isSel = _selectedDomains.contains(d.id);
                          return FilterChip(
                            avatar: Icon(d.icon, size: 18),
                            label: Text(d.labelFor(context)),
                            selected: isSel,
                            onSelected: (v) => setState(() {
                              if (v) {
                                _selectedDomains.add(d.id);
                              } else {
                                _selectedDomains.remove(d.id);
                              }
                            }),
                          );
                        }).toList(),
                      ),
                    ],
                  )
                : const SizedBox.shrink(),
          ),

          const SizedBox(height: 24),
          _SectionTitle(text: l.gameDifficultySection),
          const SizedBox(height: 12),
          Row(
            children: Difficulty.values.map((d) {
              final isSel = _difficulty == d;
              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: ChoiceChip(
                    label: SizedBox(
                      width: double.infinity,
                      child: Text(
                        _difficultyLabel(l, d),
                        textAlign: TextAlign.center,
                      ),
                    ),
                    selected: isSel,
                    onSelected: (_) => setState(() => _difficulty = d),
                  ),
                ),
              );
            }).toList(),
          ),

          const SizedBox(height: 32),
          FilledButton(
            onPressed: canStart ? _startGame : null,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
            child: _starting
                ? const SizedBox(
                    height: 24,
                    width: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(l.gameStartAction),
          ),
          const SizedBox(height: 8),
          Center(
            child: Text(
              l.gameCostHint,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _difficultyLabel(AppLocalizations l, Difficulty d) {
    switch (d) {
      case Difficulty.easy:
        return l.difficultyEasy;
      case Difficulty.medium:
        return l.difficultyMedium;
      case Difficulty.hard:
        return l.difficultyHard;
    }
  }

  Future<void> _startGame() async {
    setState(() => _starting = true);
    try {
      final response = await gameApi.startSingleGame(
        mode: _mode,
        domains: _mode == SingleGameMode.userGuesses
            ? _selectedDomains.toList()
            : null,
        difficulty: _difficulty,
        cultures: _cultures,
      );
      if (!mounted) return;
      final game = response['game'] as Map<String, dynamic>?;
      final gameId = game?['id'] as String?;
      if (gameId == null) {
        // Risposta inattesa: dovremmo sempre avere un id. Mostro errore
        // generico - non possiamo recuperare se il backend non e' aderente
        // al contratto.
        _showErrorDialog(_genericErrorMessage('missing game id'));
        return;
      }
      // Navigo passando l'intera response come 'extra' cosi' la schermata
      // di gioco non deve rifare il GET dello stato. La schermata vera e'
      // nel prossimo PR; per ora /game/:id e' un placeholder.
      if (!mounted) return;
      context.go('/game/$gameId', extra: response);
    } on ManaApiException catch (e) {
      if (!mounted) return;
      _showErrorDialog(_mapApiErrorMessage(e));
    } catch (e) {
      if (!mounted) return;
      _showErrorDialog(_genericErrorMessage(e.toString()));
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  String _mapApiErrorMessage(ManaApiException e) {
    final l = AppLocalizations.of(context);
    // I codici li allineiamo con HttpError lato backend (api/_lib/errors.ts).
    // Mostriamo testi user-facing tradotti per i casi noti; per gli altri
    // un messaggio generico.
    switch (e.code) {
      case 'INSUFFICIENT_FUNDS':
        return l.errorInsufficientGems;
      case 'RATE_LIMIT_EXCEEDED':
        return l.errorRateLimited;
      case 'AI_UNAVAILABLE':
      case 'INTERNAL_ERROR':
        return l.errorAiUnavailable;
      default:
        return l.errorGeneric(e.message ?? l.errorRequestFailed);
    }
  }

  String _genericErrorMessage(String raw) {
    final l = AppLocalizations.of(context);
    return l.errorGeneric(raw);
  }

  void _showErrorDialog(String message) {
    final l = AppLocalizations.of(context);
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.error_outline, size: 40),
        content: Text(message),
        actions: [
          FilledButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l.actionOk),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle({required this.text});

  @override
  Widget build(BuildContext context) {
    return Text(text, style: Theme.of(context).textTheme.titleMedium);
  }
}

class _ModeCard extends StatelessWidget {
  final SingleGameMode mode;
  final bool selected;
  final IconData icon;
  final String title;
  final String description;
  final VoidCallback onTap;

  const _ModeCard({
    required this.mode,
    required this.selected,
    required this.icon,
    required this.title,
    required this.description,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      // Quando selezionata: highlight il bordo e il container primary.
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: selected ? scheme.primary : Colors.transparent,
          width: 2,
        ),
      ),
      color: selected ? scheme.primaryContainer : null,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: selected
                      ? scheme.primary
                      : scheme.surfaceContainerHighest,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  icon,
                  color: selected ? scheme.onPrimary : scheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      description,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: selected
                            ? scheme.onPrimaryContainer
                            : scheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              if (selected) Icon(Icons.check_circle, color: scheme.primary),
            ],
          ),
        ),
      ),
    );
  }
}
