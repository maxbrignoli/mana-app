import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../generated/l10n/app_localizations.dart';

/// Schermata di upgrade dell'account.
///
/// Due tab:
/// - 'Crea account': l'utente anonimo attuale aggancia email+password tramite
///   auth.updateUser(). Lo user_id resta invariato, quindi gemme/profilo/partite
///   vengono mantenuti. Supabase invia automaticamente la mail di conferma.
///   Mentre l'utente non conferma, la sessione anonima resta attiva e si puo'
///   continuare a giocare; la conferma serve per poter fare login da altri
///   device e per il reset password.
/// - 'Accedi': sign-in classico con email+password. Se l'utente attuale ha
///   gia' progressi, un dialog avvisa che cambiando account si perderanno.
class UpgradeAccountScreen extends StatelessWidget {
  const UpgradeAccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l.upgradeTitle),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/account'),
          ),
          bottom: TabBar(
            tabs: [
              Tab(text: l.upgradeTabSignUp),
              Tab(text: l.upgradeTabSignIn),
            ],
          ),
        ),
        body: const TabBarView(children: [_SignUpForm(), _SignInForm()]),
      ),
    );
  }
}

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
      setState(
        () => _errorMessage = AppLocalizations.of(
          context,
        ).unexpectedError(e.toString()),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 8),
            Text(
              l.upgradeSignUpIntro,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 24),
            TextFormField(
              controller: _emailController,
              decoration: InputDecoration(
                labelText: l.upgradeEmailLabel,
                border: const OutlineInputBorder(),
                prefixIcon: const Icon(Icons.email_outlined),
              ),
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              enableSuggestions: false,
              validator: (v) => _validateEmail(l, v),
              autofillHints: const [AutofillHints.email],
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _passwordController,
              decoration: InputDecoration(
                labelText: l.upgradePasswordLabel,
                border: const OutlineInputBorder(),
                prefixIcon: const Icon(Icons.lock_outline),
                helperText: l.upgradePasswordHelper,
              ),
              obscureText: true,
              validator: (v) => _validatePassword(l, v),
              autofillHints: const [AutofillHints.newPassword],
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _confirmPasswordController,
              decoration: InputDecoration(
                labelText: l.upgradeConfirmPasswordLabel,
                border: const OutlineInputBorder(),
                prefixIcon: const Icon(Icons.lock_outline),
              ),
              obscureText: true,
              validator: (v) {
                if (v == null || v.isEmpty) {
                  return l.validationPasswordConfirmRequired;
                }
                if (v != _passwordController.text) {
                  return l.validationPasswordMismatch;
                }
                return null;
              },
            ),
            const SizedBox(height: 24),
            if (_errorMessage != null) ...[
              _ErrorBox(message: _errorMessage!),
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
                  : Text(l.upgradeCreateAccountAction),
            ),
          ],
        ),
      ),
    );
  }
}

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
      context.go('/home');
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = e.message);
    } catch (e) {
      if (!mounted) return;
      setState(
        () => _errorMessage = AppLocalizations.of(
          context,
        ).unexpectedError(e.toString()),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 8),
            Text(
              l.upgradeSignInIntro,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 24),
            TextFormField(
              controller: _emailController,
              decoration: InputDecoration(
                labelText: l.upgradeEmailLabel,
                border: const OutlineInputBorder(),
                prefixIcon: const Icon(Icons.email_outlined),
              ),
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              enableSuggestions: false,
              validator: (v) => _validateEmail(l, v),
              autofillHints: const [
                AutofillHints.username,
                AutofillHints.email,
              ],
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _passwordController,
              decoration: InputDecoration(
                labelText: l.upgradePasswordLabel,
                border: const OutlineInputBorder(),
                prefixIcon: const Icon(Icons.lock_outline),
              ),
              obscureText: true,
              validator: (v) => (v == null || v.isEmpty)
                  ? l.validationPasswordLoginRequired
                  : null,
              autofillHints: const [AutofillHints.password],
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => context.push('/account/password-reset'),
                child: Text(l.upgradeForgotPassword),
              ),
            ),
            const SizedBox(height: 16),
            if (_errorMessage != null) ...[
              _ErrorBox(message: _errorMessage!),
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
                  : Text(l.upgradeSignInAction),
            ),
          ],
        ),
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// Helpers locali
// -----------------------------------------------------------------------------

class _ErrorBox extends StatelessWidget {
  final String message;
  const _ErrorBox({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
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
              message,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onErrorContainer,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String? _validateEmail(AppLocalizations l, String? v) {
  if (v == null || v.trim().isEmpty) return l.validationEmailRequired;
  final value = v.trim();
  if (!value.contains('@') || !value.contains('.')) {
    return l.validationEmailInvalid;
  }
  return null;
}

String? _validatePassword(AppLocalizations l, String? v) {
  if (v == null || v.isEmpty) return l.validationPasswordRequired;
  if (v.length < 8) return l.validationPasswordMinLength;
  return null;
}

Future<bool?> _confirmReplaceAnonymous(BuildContext context) {
  final l = AppLocalizations.of(context);
  return showDialog<bool>(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: Text(l.warningTitle),
        content: Text(l.replaceAnonymousBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(l.actionCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l.actionContinue),
          ),
        ],
      );
    },
  );
}

void _showCheckEmailDialog(BuildContext context, String email) {
  final l = AppLocalizations.of(context);
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (dialogContext) {
      return AlertDialog(
        icon: const Icon(Icons.mark_email_read_outlined, size: 48),
        title: Text(l.emailCheckTitle),
        content: Text(l.emailCheckBody(email)),
        actions: [
          FilledButton(
            onPressed: () {
              Navigator.of(dialogContext).pop();
              context.go('/home');
            },
            child: Text(l.emailCheckBackToGame),
          ),
        ],
      );
    },
  );
}
