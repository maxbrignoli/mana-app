import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Schermata di upgrade dell'account.
///
/// Due tab:
/// - 'Crea account': l'utente anonimo attuale aggancia email+password tramite
///   auth.updateUser(). Lo user_id resta invariato, quindi gemme, partite e
///   profilo vengono mantenuti. Supabase invia automaticamente la mail di
///   conferma. Mentre l'utente non conferma, la sessione anonima resta
///   attiva e si puo' continuare a giocare; la conferma serve per poter
///   fare login da altri device e per il reset password.
/// - 'Accedi': sign-in classico con email+password. Se l'utente attuale
///   ha gia' progressi (display_name diverso da quello generato, gemme
///   spese, partite giocate), un dialog avvisa che cambiando account si
///   perderanno. Confermando, signOut() della sessione anonima +
///   signInWithPassword() del nuovo account.
///
/// Niente conferma email obbligatoria all'accesso: il dashboard Supabase
/// e' configurato senza Confirm email. La conferma resta utile per il
/// reset password (vedi PasswordResetScreen).
class UpgradeAccountScreen extends StatelessWidget {
  const UpgradeAccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Account'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/account'),
          ),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Crea account'),
              Tab(text: 'Accedi'),
            ],
          ),
        ),
        body: const TabBarView(children: [_SignUpForm(), _SignInForm()]),
      ),
    );
  }
}

/// Form di creazione account: collega email+password all'utente anonimo
/// attuale tramite auth.updateUser. NON cambia lo user_id.
class _SignUpForm extends StatefulWidget {
  const _SignUpForm();

  @override
  State<_SignUpForm> createState() => _SignUpFormState();
}

class _SignUpFormState extends State<_SignUpForm> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _submitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _errorMessage = null;
    });
    try {
      final supabase = Supabase.instance.client;
      await supabase.auth.updateUser(
        UserAttributes(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        ),
      );
      if (!mounted) return;
      _showCheckEmailDialog(context, _emailController.text.trim());
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = e.message);
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = 'Errore inatteso: $e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 8),
            Text(
              'Crea un account per salvare i tuoi progressi e ritrovarli su altri dispositivi.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 24),
            TextFormField(
              controller: _emailController,
              decoration: const InputDecoration(
                labelText: 'Email',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.email_outlined),
              ),
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              enableSuggestions: false,
              validator: _validateEmail,
              autofillHints: const [AutofillHints.email],
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _passwordController,
              decoration: const InputDecoration(
                labelText: 'Password',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.lock_outline),
                helperText: 'Almeno 8 caratteri',
              ),
              obscureText: true,
              validator: _validatePassword,
              autofillHints: const [AutofillHints.newPassword],
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _confirmPasswordController,
              decoration: const InputDecoration(
                labelText: 'Conferma password',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.lock_outline),
              ),
              obscureText: true,
              validator: (v) {
                if (v == null || v.isEmpty) return 'Conferma la password';
                if (v != _passwordController.text) {
                  return 'Le password non coincidono';
                }
                return null;
              },
            ),
            const SizedBox(height: 24),
            if (_errorMessage != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.error_outline,
                      color: Theme.of(context).colorScheme.onErrorContainer,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _errorMessage!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onErrorContainer,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Crea account'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Form di login con email+password. Se l'utente attuale e' anonimo,
/// avverte che i progressi ospite andranno persi.
class _SignInForm extends StatefulWidget {
  const _SignInForm();

  @override
  State<_SignInForm> createState() => _SignInFormState();
}

class _SignInFormState extends State<_SignInForm> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _submitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    // Se l'utente corrente e' anonimo, chiediamo conferma esplicita perche'
    // signIn distrugge la sessione anonima e i progressi.
    final session = Supabase.instance.client.auth.currentSession;
    final isAnonymous = session?.user.isAnonymous ?? false;
    if (isAnonymous) {
      final confirmed = await _confirmReplaceAnonymous(context);
      if (confirmed != true) return;
    }

    setState(() {
      _submitting = true;
      _errorMessage = null;
    });
    try {
      final supabase = Supabase.instance.client;
      await supabase.auth.signInWithPassword(
        email: _emailController.text.trim(),
        password: _passwordController.text,
      );
      if (!mounted) return;
      // Il router fara' redirect a /home automaticamente al cambio sessione.
      context.go('/home');
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = e.message);
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = 'Errore inatteso: $e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 8),
            Text(
              'Accedi con un account gia esistente.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 24),
            TextFormField(
              controller: _emailController,
              decoration: const InputDecoration(
                labelText: 'Email',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.email_outlined),
              ),
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              enableSuggestions: false,
              validator: _validateEmail,
              autofillHints: const [
                AutofillHints.username,
                AutofillHints.email,
              ],
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _passwordController,
              decoration: const InputDecoration(
                labelText: 'Password',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.lock_outline),
              ),
              obscureText: true,
              validator: (v) =>
                  (v == null || v.isEmpty) ? 'Inserisci la password' : null,
              autofillHints: const [AutofillHints.password],
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => context.push('/account/password-reset'),
                child: const Text('Password dimenticata?'),
              ),
            ),
            const SizedBox(height: 16),
            if (_errorMessage != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.error_outline,
                      color: Theme.of(context).colorScheme.onErrorContainer,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _errorMessage!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onErrorContainer,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Accedi'),
            ),
          ],
        ),
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// Validators & dialog helpers
// -----------------------------------------------------------------------------

String? _validateEmail(String? v) {
  if (v == null || v.trim().isEmpty) return 'Inserisci la tua email';
  final value = v.trim();
  // Validazione email molto base: presenza di @ e un dominio con almeno
  // un punto. Non vogliamo essere restrittivi (regex troppo stretti
  // rifiutano email valide); la validazione vera la fa Supabase.
  if (!value.contains('@') || !value.contains('.')) {
    return 'Email non valida';
  }
  return null;
}

String? _validatePassword(String? v) {
  if (v == null || v.isEmpty) return 'Inserisci una password';
  if (v.length < 8) return 'Almeno 8 caratteri';
  return null;
}

Future<bool?> _confirmReplaceAnonymous(BuildContext context) {
  return showDialog<bool>(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: const Text('Attenzione'),
        content: const Text(
          'Stai per accedere a un altro account. Le gemme, le partite e tutti i progressi del tuo account ospite andranno persi.\n\nVuoi continuare?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Annulla'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Continua'),
          ),
        ],
      );
    },
  );
}

void _showCheckEmailDialog(BuildContext context, String email) {
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (dialogContext) {
      return AlertDialog(
        icon: const Icon(Icons.mark_email_read_outlined, size: 48),
        title: const Text('Controlla la tua email'),
        content: Text(
          'Abbiamo inviato un link di conferma a $email.\n\nApri la mail e clicca il link per attivare il tuo account.\n\nNel frattempo puoi continuare a giocare.',
        ),
        actions: [
          FilledButton(
            onPressed: () {
              Navigator.of(dialogContext).pop();
              context.go('/home');
            },
            child: const Text('Torna a giocare'),
          ),
        ],
      );
    },
  );
}
