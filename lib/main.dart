import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/api/mana_api.dart';
import 'core/config/app_config.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/game/game_api.dart';
import 'generated/l10n/app_localizations.dart';

/// Istanza globale del client API core. Per ora un singleton modulare;
/// quando adotteremo un framework di state management lo iniettiamo via
/// provider.
late final ManaApi manaApi;

/// Istanza globale del client API specifico di gioco. Costruita sopra
/// [manaApi]: quando il core sara' estratto, manaApi migrera' nel
/// package core e gameApi restera' qui.
late final GameApi gameApi;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await dotenv.load();

  await Supabase.initialize(
    url: AppConfig.supabaseUrl,
    anonKey: AppConfig.supabaseAnonKey,
  );

  manaApi = ManaApi();
  gameApi = GameApi.from(manaApi);

  runApp(const ManaApp());
}

class ManaApp extends StatefulWidget {
  const ManaApp({super.key});

  @override
  State<ManaApp> createState() => _ManaAppState();
}

class _ManaAppState extends State<ManaApp> {
  late final _router = buildAppRouter(Supabase.instance.client);

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      // 'Mana' e' il brand: lo prendiamo dalle stringhe localizzate (anche
      // se sara' uguale in tutte le lingue, lo trattiamo come stringa
      // gestita per coerenza).
      onGenerateTitle: (context) => AppLocalizations.of(context).appName,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      routerConfig: _router,
      debugShowCheckedModeBanner: false,
      // i18n: il device fornisce la lingua di default. Se non e' tra
      // quelle supportate, Flutter cade automaticamente sulla prima
      // di supportedLocales (en) come fallback. La selezione manuale
      // della lingua nel profilo arrivera' in un PR successivo.
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
    );
  }
}
