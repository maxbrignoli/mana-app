import 'package:flutter/material.dart';

import '../../generated/l10n/app_localizations.dart';

/// Lista canonica dei domini di personaggi proposti nella schermata di
/// scelta partita.
///
/// L'`id` e' la stringa stabile usata sul wire (deve combaciare con quello
/// che il bench e i prompt si aspettano). L'`icon` e' un placeholder
/// Material in attesa della grafica vera (Fase 7). L'etichetta e' risolta
/// runtime via [labelFor] per supportare la localizzazione.
///
/// Quando aggiungeremo nuovi domini (cinema, libri, fumetti, videogiochi,
/// ecc.) li mettiamo qui e aggiungiamo le chiavi i18n corrispondenti.
class GameDomain {
  final String id;
  final IconData icon;

  const GameDomain({required this.id, required this.icon});

  /// Etichetta tradotta in base al locale corrente.
  String labelFor(BuildContext context) {
    final l = AppLocalizations.of(context);
    switch (id) {
      case 'personaggi-storici':
        return l.domainHistoricalCharacters;
      case 'cartoni':
        return l.domainCartoons;
      case 'sport':
        return l.domainSports;
      case 'musica':
        return l.domainMusic;
      case 'scienza':
        return l.domainScience;
      default:
        return id;
    }
  }
}

const List<GameDomain> kGameDomains = [
  GameDomain(id: 'personaggi-storici', icon: Icons.account_balance),
  GameDomain(id: 'cartoni', icon: Icons.movie_filter),
  GameDomain(id: 'sport', icon: Icons.sports_soccer),
  GameDomain(id: 'musica', icon: Icons.music_note),
  GameDomain(id: 'scienza', icon: Icons.science),
];
