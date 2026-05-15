import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../features/auth/login_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/splash/splash_screen.dart';

/// Routing della app, basato su [go_router].
///
/// Struttura:
/// - `/`        splash: visualizzato all'avvio mentre il router decide
/// - `/login`   schermata di login (placeholder per ora)
/// - `/home`    home post-login (placeholder per ora)
///
/// Il [redirect] e' auth-aware: legge la sessione corrente da Supabase
/// e reindirizza in funzione dello stato di autenticazione. Si rinfresca
/// automaticamente quando lo stato di auth cambia, grazie alla
/// [refreshListenable] alimentata dallo stream [SupabaseClient.auth.onAuthStateChange].
///
/// Si lega all'oggetto router-wide [router]: l'app usa un singleton tramite
/// [appRouter]. Non e' necessario un DI complesso per ora.
GoRouter buildAppRouter(SupabaseClient supabase) {
  final authListenable = _SupabaseAuthListenable(supabase);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: authListenable,
    debugLogDiagnostics: kDebugMode,
    routes: [
      GoRoute(path: '/', builder: (context, state) => const SplashScreen()),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/home', builder: (context, state) => const HomeScreen()),
    ],
    redirect: (context, state) {
      final isLoggedIn = supabase.auth.currentSession != null;
      final location = state.matchedLocation;

      // Splash: dove andare in base allo stato auth.
      if (location == '/') {
        return isLoggedIn ? '/home' : '/login';
      }

      // Schermate protette: rispedisci a login se non autenticato.
      const protectedRoutes = {'/home'};
      if (protectedRoutes.contains(location) && !isLoggedIn) {
        return '/login';
      }

      // Schermate solo per anonimi: rispedisci a home se gia' loggato.
      const guestOnlyRoutes = {'/login'};
      if (guestOnlyRoutes.contains(location) && isLoggedIn) {
        return '/home';
      }

      return null; // niente redirect
    },
  );
}

/// Adattatore che espone i cambi di stato auth di Supabase come
/// [Listenable], cosi' [GoRouter.refreshListenable] sa quando rivalutare
/// il redirect (login / logout / refresh token).
class _SupabaseAuthListenable extends ChangeNotifier {
  final SupabaseClient _supabase;
  late final StreamSubscription<AuthState> _subscription;

  _SupabaseAuthListenable(this._supabase) {
    _subscription = _supabase.auth.onAuthStateChange.listen((_) {
      notifyListeners();
    });
  }

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}
