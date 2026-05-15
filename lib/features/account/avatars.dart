import 'package:flutter/material.dart';

/// Set di avatar disponibili per l'utente.
///
/// PR #3 della Fase 6: usiamo placeholder con icone Material. Gli asset
/// grafici veri (illustrazioni stile Art Nouveau coerenti con Mana) arrivano
/// nella Fase 7. Lo schema dati e' stabile (id testuale salvato in profiles.avatar_id),
/// quindi sostituire le icone in seguito non rompera' i profili esistenti.
///
/// Gli id sono pensati per essere stabili nel tempo: ogni avatar futuro
/// rispettera' la regex /^[a-z0-9_]{1,40}$/ richiesta dall'API.
class AvatarOption {
  final String id;
  final IconData icon;
  final String label;

  const AvatarOption({
    required this.id,
    required this.icon,
    required this.label,
  });
}

const List<AvatarOption> kAvatarOptions = [
  AvatarOption(id: 'avatar_default', icon: Icons.person, label: 'Default'),
  AvatarOption(id: 'avatar_wizard', icon: Icons.auto_awesome, label: 'Mago'),
  AvatarOption(id: 'avatar_fox', icon: Icons.pets, label: 'Volpe'),
  AvatarOption(
    id: 'avatar_dragon',
    icon: Icons.local_fire_department,
    label: 'Drago',
  ),
  AvatarOption(id: 'avatar_sword', icon: Icons.shield, label: 'Cavaliere'),
  AvatarOption(id: 'avatar_star', icon: Icons.star, label: 'Stella'),
  AvatarOption(id: 'avatar_crystal', icon: Icons.diamond, label: 'Cristallo'),
  AvatarOption(id: 'avatar_owl', icon: Icons.visibility, label: 'Gufo'),
];

/// Trova un AvatarOption dato il suo id. Se non trovato, ritorna il default.
AvatarOption avatarFromId(String? id) {
  if (id == null) return kAvatarOptions.first;
  for (final a in kAvatarOptions) {
    if (a.id == id) return a;
  }
  return kAvatarOptions.first;
}
