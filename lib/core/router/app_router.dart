import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../features/account/account_screen.dart';
import '../../features/account/password_reset_screen.dart';
import '../../features/account/upgrade_screen.dart';
import '../../features/game/game_screen.dart';
import '../../features/game/new_game_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/splash/splash_screen.dart';

/// Routing della app, basato su [go_router].
///
/// Struttura:
/// - `/`       splash: bootstrap iniziale + signInAnonymously() se servono
/// - `/home`   home post-login (placeholder per ora)
///
/// Differenza chiave rispetto al PR #1: NON esiste una `/login` separata.
/// La filosofia di prodotto e' "zero attrito": l'utente entra direttamente
/// a giocare; lo splash crea automaticamente una sessione anonima se serve.
/// Login/signup con email/password e provider social arriveranno come
/// "upgrade" dell'account anonimo, in PR successivi della Fase 6.
///
/// Il [redirect] e' auth-aware:
/// - se loggato (anche anonimo): da `/` redirige a `/home`
/// - se NON loggato: resta sullo splash, che fara' lui il sign-in
///
/// Si rinfresca automaticamente quando lo stato di auth cambia, grazie alla
/// [refreshListenable] alimentata dallo stream
/// [SupabaseClient.auth.onAuthStateChange].
GoRouter buildAppRouter(SupabaseClient supabase) {
  final authListenable = _SupabaseAuthListenable(supabase);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: authListenable,
    debugLogDiagnostics: kDebugMode,
    routes: [
      GoRoute(path: '/', builder: (context, state) => const SplashScreen()),
      GoRoute(path: '/home', builder: (context, state) => const HomeScreen()),
      GoRoute(
        path: '/game/new',
        builder: (context, state) => const NewGameScreen(),
      ),
      GoRoute(
        path: '/game/:id',
        builder: (context, state) {
          // `extra` viene popolato da NewGameScreen al successo di start:
          // contiene { game, firstManaMove? }. E' un'ottimizzazione: la
          // schermata di gioco vera lo usera' come stato iniziale invece
          // di rifare un GET. Se l'utente apre l'URL direttamente o ricarica
          // la pagina, `extra` e' null e la schermata fara' GET di fallback.
          final initialState = state.extra as Map<String, dynamic>?;
          return GameScreen(
            gameId: state.pathParameters['id']!,
            initialState: initialState,
          );
        },
      ),
      GoRoute(
        path: '/account',
        builder: (context, state) => const AccountScreen(),
        routes: [
          GoRoute(
            path: 'upgrade',
            builder: (context, state) => const UpgradeAccountScreen(),
          ),
          GoRoute(
            path: 'password-reset',
            builder: (context, state) => const PasswordResetScreen(),
          ),
        ],
      ),
    ],
    redirect: (context, state) {
      final isLoggedIn = supabase.auth.currentSession != null;
      final location = state.matchedLocation;

      // Su splash: se gia' loggato (es. al riavvio dell'app la sessione e'
      // persistita) saltiamo dritto a /home. Se NON loggato, restiamo qui:
      // SplashScreen.initState() chiamera' signInAnonymously().
      if (location == '/' && isLoggedIn) {
        return '/home';
      }

      // Schermate protette: rispedisci a splash se non autenticato.
      // Includono tutte le rotte sotto /account (upgrade, password-reset)
      // e tutte le rotte di gioco /game/*.
      final isProtected =
          location == '/home' ||
          location.startsWith('/account') ||
          location.startsWith('/game');
      if (isProtected && !isLoggedIn) {
        return '/';
      }

      return null;
    },
  );
}

/// Adattatore che espone i cambi di stato auth di Supabase come
/// [Listenable], cosi' [GoRouter.refreshListenable] sa quando rivalutare
/// il redirect (login, logout, refresh token, signInAnonymously).
class _SupabaseAuthListenable extends ChangeNotifier {
  late final StreamSubscription<AuthState> _subscription;

  _SupabaseAuthListenable(SupabaseClient supabase) {
    _subscription = supabase.auth.onAuthStateChange.listen((_) {
      notifyListeners();
    });
  }

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}
