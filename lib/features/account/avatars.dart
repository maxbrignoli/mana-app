import 'package:flutter/material.dart';

import '../../generated/l10n/app_localizations.dart';

/// Set di avatar disponibili per l'utente.
///
/// PR #3 della Fase 6: usiamo placeholder con icone Material. Gli asset
/// grafici veri (illustrazioni stile Art Nouveau coerenti con Mana) arrivano
/// nella Fase 7. Lo schema dati e' stabile (id testuale salvato in profiles.avatar_id),
/// quindi sostituire le icone in seguito non rompera' i profili esistenti.
///
/// Gli id sono pensati per essere stabili nel tempo: ogni avatar futuro
/// rispettera' la regex /^[a-z0-9_]{1,40}$/ richiesta dall'API.
///
/// Le label sono RISOLTE A RUNTIME dalle stringhe localizzate (vedi
/// [labelFor]). Mai usare label statiche.
class AvatarOption {
  final String id;
  final IconData icon;

  const AvatarOption({required this.id, required this.icon});

  /// Etichetta tradotta in base al locale corrente.
  String labelFor(BuildContext context) {
    final l = AppLocalizations.of(context);
    switch (id) {
      case 'avatar_default':
        return l.avatarDefault;
      case 'avatar_wizard':
        return l.avatarWizard;
      case 'avatar_fox':
        return l.avatarFox;
      case 'avatar_dragon':
        return l.avatarDragon;
      case 'avatar_sword':
        return l.avatarKnight;
      case 'avatar_star':
        return l.avatarStar;
      case 'avatar_crystal':
        return l.avatarCrystal;
      case 'avatar_owl':
        return l.avatarOwl;
      default:
        return l.avatarDefault;
    }
  }
}

const List<AvatarOption> kAvatarOptions = [
  AvatarOption(id: 'avatar_default', icon: Icons.person),
  AvatarOption(id: 'avatar_wizard', icon: Icons.auto_awesome),
  AvatarOption(id: 'avatar_fox', icon: Icons.pets),
  AvatarOption(id: 'avatar_dragon', icon: Icons.local_fire_department),
  AvatarOption(id: 'avatar_sword', icon: Icons.shield),
  AvatarOption(id: 'avatar_star', icon: Icons.star),
  AvatarOption(id: 'avatar_crystal', icon: Icons.diamond),
  AvatarOption(id: 'avatar_owl', icon: Icons.visibility),
];

/// Trova un AvatarOption dato il suo id. Se non trovato, ritorna il default.
AvatarOption avatarFromId(String? id) {
  if (id == null) return kAvatarOptions.first;
  for (final a in kAvatarOptions) {
    if (a.id == id) return a;
  }
  return kAvatarOptions.first;
}
