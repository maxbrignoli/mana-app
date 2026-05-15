import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/api/mana_api.dart';
import '../../main.dart' show manaApi;
import '../account/avatars.dart';

/// Home post-login. Mostra avatar + display_name + gemme + accesso al profilo.
///
/// Verra' arricchita nei prossimi PR con un grande bottone "Inizia partita".
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
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
    final session = Supabase.instance.client.auth.currentSession;
    final isAnonymous = session?.user.isAnonymous ?? false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mana'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Ricarica',
            onPressed: _refresh,
          ),
          IconButton(
            icon: const Icon(Icons.person),
            tooltip: 'Profilo',
            onPressed: () => context.go('/account'),
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
          final profile = (data['profile'] as Map?) ?? const {};
          final gems = (data['gems'] as Map?) ?? const {};
          final displayName =
              (profile['display_name'] as String?) ?? '(senza nome)';
          final avatar = avatarFromId(profile['avatar_id'] as String?);
          final balance = (gems['balance'] as num?)?.toInt() ?? 0;

          return Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (isAnonymous)
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.secondaryContainer,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.info_outline, size: 20),
                        SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            'Stai giocando come ospite. Crea un account per non perdere i progressi.',
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 32),
                CircleAvatar(
                  radius: 48,
                  backgroundColor: Theme.of(
                    context,
                  ).colorScheme.primaryContainer,
                  child: Icon(
                    avatar.icon,
                    size: 48,
                    color: Theme.of(context).colorScheme.onPrimaryContainer,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'Benvenuto',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Text(
                  displayName,
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 32),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.diamond, color: Color(0xFF4A148C)),
                    const SizedBox(width: 8),
                    Text(
                      '$balance gemme',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ],
                ),
                const SizedBox(height: 32),
                Text(
                  'Placeholder home. Il gioco arriva nei prossimi PR.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _errorView(Object error) {
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
            'Impossibile caricare il profilo',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _refresh, child: const Text('Riprova')),
        ],
      ),
    );
  }
}
