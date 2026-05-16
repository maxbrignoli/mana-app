import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/api/mana_api.dart';
import 'core/config/app_config.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/game/game_api.dart';

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
      title: 'Mana',
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      routerConfig: _router,
      debugShowCheckedModeBanner: false,
    );
  }
}
