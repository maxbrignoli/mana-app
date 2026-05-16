import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/api/mana_api.dart';
import '../../generated/l10n/app_localizations.dart';
import '../../main.dart' show manaApi;
import 'avatars.dart';

/// Pagina del profilo / account utente.
///
/// Mostra:
/// - avatar editabile (selettore tra avatar predefiniti)
/// - display_name editabile (textfield modale con validazione lunghezza)
/// - ID privato a 9 cifre (read-only, per condivisione futura con amici)
/// - statistiche aggregate (partite, vittorie, gemme)
/// - stato account: ospite vs registrato; bottone "Crea account" se ospite
///
/// Carica i dati via /api/me al mount. Permette refresh manuale.
class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  Future<Map<String, dynamic>>? _meFuture;

  @override
  void initState() {
    super.initState();
    _meFuture = manaApi.getMe();
  }

  void _refresh() {
    setState(() {
      _meFuture = manaApi.getMe();
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l.accountTitle),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/home'),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: l.actionReload,
            onPressed: _refresh,
          ),
        ],
      ),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _meFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return _errorView(snapshot.error!);
          }
          final data = snapshot.data!;
          return _ProfileBody(data: data, onRefresh: _refresh);
        },
      ),
    );
  }

  Widget _errorView(Object error) {
    final l = AppLocalizations.of(context);
    final message = error is ManaApiException
        ? '${error.status ?? "?"} ${error.code ?? ""}: ${error.message ?? error}'
        : error.toString();
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.error_outline,
            size: 48,
            color: Theme.of(context).colorScheme.error,
          ),
          const SizedBox(height: 16),
          Text(
            l.errorLoadProfile,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _refresh, child: Text(l.actionRetry)),
        ],
      ),
    );
  }
}

class _ProfileBody extends StatelessWidget {
  final Map<String, dynamic> data;
  final VoidCallback onRefresh;

  const _ProfileBody({required this.data, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final profile = (data['profile'] as Map?) ?? const {};
    final gems = (data['gems'] as Map?) ?? const {};
    final stats = (data['stats'] as Map?) ?? const {};
    final session = Supabase.instance.client.auth.currentSession;
    final isAnonymous = session?.user.isAnonymous ?? false;

    final displayName = (profile['display_name'] as String?) ?? l.errorNoName;
    final avatarId = profile['avatar_id'] as String?;
    final privateId = (profile['private_id'] as num?)?.toInt();
    final balance = (gems['balance'] as num?)?.toInt() ?? 0;
    final rageLevel = (profile['rage_level'] as num?)?.toInt() ?? 0;
    final totalGames = (stats['single_games_total'] as num?)?.toInt() ?? 0;
    final wonGames = (stats['single_games_won'] as num?)?.toInt() ?? 0;
    final winRate = stats['single_win_rate'];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (isAnonymous) const _GuestBanner(),
        const SizedBox(height: 8),

        // Sezione identita'
        _SectionCard(
          children: [
            Row(
              children: [
                _AvatarPreview(
                  avatar: avatarFromId(avatarId),
                  onTap: () => _pickAvatar(context, avatarId),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        displayName,
                        style: Theme.of(context).textTheme.headlineSmall,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      if (privateId != null)
                        Text(
                          l.accountIdLabel(_formatPrivateId(privateId)),
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
                              ),
                        ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.edit),
                  tooltip: l.accountEditNameTooltip,
                  onPressed: () => _editDisplayName(context, displayName),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Sezione statistiche
        _SectionCard(
          title: l.accountSectionStats,
          children: [
            _StatRow(
              icon: Icons.diamond,
              label: l.accountStatGems,
              value: balance.toString(),
            ),
            _StatRow(
              icon: Icons.casino,
              label: l.accountStatGamesPlayed,
              value: totalGames.toString(),
            ),
            _StatRow(
              icon: Icons.emoji_events,
              label: l.accountStatGamesWon,
              value: wonGames.toString(),
            ),
            _StatRow(
              icon: Icons.percent,
              label: l.accountStatWinRate,
              value: winRate == null
                  ? l.accountStatEmpty
                  : l.accountStatPercent(winRate.toString()),
            ),
            if (rageLevel > 0)
              _StatRow(
                icon: Icons.warning_amber,
                label: l.accountStatRageLevel,
                value: l.accountStatRageLevelValue(rageLevel),
                emphasis: true,
              ),
          ],
        ),
        const SizedBox(height: 16),

        // Sezione account
        _SectionCard(
          title: l.accountSection,
          children: [
            if (isAnonymous) ...[
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.person_outline),
                title: Text(l.accountGuestTitle),
                subtitle: Text(l.accountGuestSubtitle),
              ),
              const SizedBox(height: 8),
              FilledButton.icon(
                icon: const Icon(Icons.person_add),
                label: Text(l.accountUpgradeCta),
                onPressed: () => context.push('/account/upgrade'),
              ),
            ] else ...[
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.email_outlined),
                title: Text(l.accountEmailLabel),
                subtitle: Text((profile['email'] as String?) ?? l.errorNoEmail),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                icon: const Icon(Icons.logout),
                label: Text(l.accountSignOut),
                onPressed: () async {
                  await Supabase.instance.client.auth.signOut();
                  if (context.mounted) context.go('/');
                },
              ),
            ],
          ],
        ),
      ],
    );
  }

  String _formatPrivateId(int id) {
    final s = id.toString().padLeft(9, '0');
    return '${s.substring(0, 3)} ${s.substring(3, 6)} ${s.substring(6, 9)}';
  }

  Future<void> _pickAvatar(BuildContext context, String? currentId) async {
    final l = AppLocalizations.of(context);
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        return _AvatarPicker(currentId: currentId);
      },
    );
    if (selected == null || selected == currentId) return;
    if (!context.mounted) return;

    await _patchAndRefresh(
      context,
      patch: () => manaApi.patchMe(avatarId: selected),
      successMessage: l.accountAvatarUpdated,
    );
  }

  Future<void> _editDisplayName(BuildContext context, String current) async {
    final l = AppLocalizations.of(context);
    final controller = TextEditingController(text: current);
    final newName = await showDialog<String>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text(l.accountEditNameDialogTitle),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLength: 30,
            decoration: InputDecoration(
              hintText: l.accountEditNameHint,
              border: const OutlineInputBorder(),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(l.actionCancel),
            ),
            FilledButton(
              onPressed: () {
                final value = controller.text.trim();
                if (value.isEmpty || value == current) {
                  Navigator.of(context).pop();
                } else {
                  Navigator.of(context).pop(value);
                }
              },
              child: Text(l.actionSave),
            ),
          ],
        );
      },
    );
    if (newName == null || !context.mounted) return;
    await _patchAndRefresh(
      context,
      patch: () => manaApi.patchMe(displayName: newName),
      successMessage: l.accountNameUpdated,
    );
  }

  Future<void> _patchAndRefresh(
    BuildContext context, {
    required Future<Map<String, dynamic>> Function() patch,
    required String successMessage,
  }) async {
    final l = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await patch();
      onRefresh();
      messenger.showSnackBar(SnackBar(content: Text(successMessage)));
    } on ManaApiException catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(l.errorGeneric(e.message ?? l.errorRequestFailed)),
        ),
      );
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(l.errorGeneric(e.toString()))),
      );
    }
  }
}

class _GuestBanner extends StatelessWidget {
  const _GuestBanner();

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.secondaryContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline, size: 20),
          const SizedBox(width: 8),
          Expanded(child: Text(l.accountGuestBannerShort)),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String? title;
  final List<Widget> children;
  const _SectionCard({this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (title != null) ...[
              Text(title!, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
            ],
            ...children,
          ],
        ),
      ),
    );
  }
}

class _StatRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final bool emphasis;

  const _StatRow({
    required this.icon,
    required this.label,
    required this.value,
    this.emphasis = false,
  });

  @override
  Widget build(BuildContext context) {
    final color = emphasis
        ? Theme.of(context).colorScheme.error
        : Theme.of(context).colorScheme.onSurface;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(width: 12),
          Expanded(child: Text(label)),
          Text(
            value,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _AvatarPreview extends StatelessWidget {
  final AvatarOption avatar;
  final VoidCallback onTap;
  const _AvatarPreview({required this.avatar, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Stack(
        children: [
          CircleAvatar(
            radius: 36,
            backgroundColor: Theme.of(context).colorScheme.primaryContainer,
            child: Icon(
              avatar.icon,
              size: 36,
              color: Theme.of(context).colorScheme.onPrimaryContainer,
            ),
          ),
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primary,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.edit,
                size: 14,
                color: Theme.of(context).colorScheme.onPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AvatarPicker extends StatelessWidget {
  final String? currentId;
  const _AvatarPicker({required this.currentId});

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l.accountPickAvatarTitle,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 16),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 4,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              children: kAvatarOptions.map((avatar) {
                final isSelected = avatar.id == currentId;
                return InkWell(
                  onTap: () => Navigator.of(context).pop(avatar.id),
                  borderRadius: BorderRadius.circular(40),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      CircleAvatar(
                        radius: 28,
                        backgroundColor: isSelected
                            ? Theme.of(context).colorScheme.primary
                            : Theme.of(context).colorScheme.primaryContainer,
                        child: Icon(
                          avatar.icon,
                          size: 28,
                          color: isSelected
                              ? Theme.of(context).colorScheme.onPrimary
                              : Theme.of(
                                  context,
                                ).colorScheme.onPrimaryContainer,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        avatar.labelFor(context),
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }
}
