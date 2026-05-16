import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../generated/l10n/app_localizations.dart';

/// Schermata di richiesta reset password.
///
/// L'utente inserisce la sua email; chiamiamo
/// auth.resetPasswordForEmail() e mostriamo conferma.
/// Volutamente NON diciamo se l'email esiste o meno nel sistema (best
/// practice di sicurezza: non vogliamo che un attaccante usi questo
/// form come "user enumeration").
class PasswordResetScreen extends StatefulWidget {
  const PasswordResetScreen({super.key});

  @override
  State<PasswordResetScreen> createState() => _PasswordResetScreenState();
}

class _PasswordResetScreenState extends State<PasswordResetScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  bool _submitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _emailController.dispose();
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
      await supabase.auth.resetPasswordForEmail(_emailController.text.trim());
      if (!mounted) return;
      _showSentDialog(context);
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
    return Scaffold(
      appBar: AppBar(
        title: Text(l.passwordResetTitle),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 8),
              Text(
                l.passwordResetIntro,
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
                autofillHints: const [AutofillHints.email],
                validator: (v) {
                  if (v == null || v.trim().isEmpty) {
                    return l.validationEmailRequired;
                  }
                  final value = v.trim();
                  if (!value.contains('@') || !value.contains('.')) {
                    return l.validationEmailInvalid;
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
                            color: Theme.of(
                              context,
                            ).colorScheme.onErrorContainer,
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
                    : Text(l.passwordResetSendAction),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

void _showSentDialog(BuildContext context) {
  final l = AppLocalizations.of(context);
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (dialogContext) {
      return AlertDialog(
        icon: const Icon(Icons.mark_email_read_outlined, size: 48),
        title: Text(l.passwordResetSentTitle),
        content: Text(l.passwordResetSentBody),
        actions: [
          FilledButton(
            onPressed: () {
              Navigator.of(dialogContext).pop();
              context.pop(); // torna a UpgradeAccountScreen
            },
            child: Text(l.actionOk),
          ),
        ],
      );
    },
  );
}
