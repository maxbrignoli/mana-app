import 'package:dio/dio.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config/app_config.dart';

/// Eccezione lanciata dalle chiamate al backend Mana quando la risposta
/// ha un body con `{ error: { code, message } }` (formato dei nostri
/// HttpError lato Vercel).
///
/// I campi sono opzionali: errori di rete, timeout, 5xx senza body strutturato
/// arrivano qui senza `code`/`message` ma con `status`.
class ManaApiException implements Exception {
  final int? status;
  final String? code;
  final String? message;
  final dynamic raw;

  ManaApiException({this.status, this.code, this.message, this.raw});

  @override
  String toString() {
    final parts = <String>[];
    if (status != null) parts.add('status=$status');
    if (code != null) parts.add('code=$code');
    if (message != null) parts.add('message=$message');
    return 'ManaApiException(${parts.join(', ')})';
  }
}

/// Client HTTP del backend Mana.
///
/// Singolo punto di accesso al backend Vercel. Caratteristiche:
/// - Iniezione automatica del JWT di Supabase Auth come Bearer token.
/// - Mappa automaticamente le response di errore del backend
///   ({ error: { code, message } }) in [ManaApiException] tipizzate.
/// - Timeout di default 15s per chiamata.
///
/// Le chiamate specifiche (es. `getMe()`, `startGame(...)`) sono metodi
/// ergonomici qui sotto: cosi' i caller non manipolano direttamente i
/// path delle API.
///
/// Stateless: una sola istanza per app. Va istanziata in [main] e passata
/// (o resa accessibile via un singleton/provider) ai pezzi che la usano.
class ManaApi {
  final Dio _dio;
  final SupabaseClient _supabase;

  ManaApi({Dio? dio, SupabaseClient? supabase})
    : _dio =
          dio ??
          Dio(
            BaseOptions(
              baseUrl: AppConfig.backendBaseUrl,
              connectTimeout: const Duration(seconds: 10),
              receiveTimeout: const Duration(seconds: 15),
              headers: const {'Content-Type': 'application/json'},
              // Non lanciamo eccezione sui 4xx: le mappiamo come ManaApiException
              // (piu' utili al chiamante della DioException grezza).
              validateStatus: (status) => status != null && status < 600,
            ),
          ),
      _supabase = supabase ?? Supabase.instance.client {
    _dio.interceptors.add(_AuthInterceptor(_supabase));
  }

  // -------------------------------------------------------------------------
  // Endpoint helpers
  // -------------------------------------------------------------------------

  /// GET /api/health. Non richiede autenticazione.
  Future<Map<String, dynamic>> health() async {
    return _get('/api/health', authRequired: false);
  }

  /// GET /api/me. Profilo + balance gemme + stats dell'utente autenticato.
  Future<Map<String, dynamic>> getMe() async {
    return _get('/api/me');
  }

  /// PATCH /api/me. Aggiorna i campi modificabili del profilo
  /// (display_name, avatar_id). Almeno uno dei due deve essere fornito.
  /// Ritorna il profilo aggiornato.
  Future<Map<String, dynamic>> patchMe({
    String? displayName,
    String? avatarId,
  }) async {
    final body = <String, String>{};
    if (displayName != null) body['display_name'] = displayName;
    if (avatarId != null) body['avatar_id'] = avatarId;
    if (body.isEmpty) {
      throw ArgumentError(
        'patchMe richiede almeno un campo tra displayName e avatarId',
      );
    }
    return _patch('/api/me', body);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /// GET generico con gestione errori uniforme.
  Future<Map<String, dynamic>> _get(
    String path, {
    bool authRequired = true,
  }) async {
    try {
      final response = await _dio.get<dynamic>(
        path,
        options: Options(extra: {'authRequired': authRequired}),
      );
      return _unwrapResponse(response);
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  /// PATCH generico con gestione errori uniforme.
  Future<Map<String, dynamic>> _patch(
    String path,
    Map<String, dynamic> body, {
    bool authRequired = true,
  }) async {
    try {
      final response = await _dio.patch<dynamic>(
        path,
        data: body,
        options: Options(extra: {'authRequired': authRequired}),
      );
      return _unwrapResponse(response);
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  /// POST generico con gestione errori uniforme. Espone l'interfaccia base
  /// per chiamate API che modificano lo stato (create/azione). Usato dai
  /// moduli specifici di gioco (es. GameApi) tramite il metodo pubblico
  /// [post].
  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic> body, {
    bool authRequired = true,
  }) async {
    try {
      final response = await _dio.post<dynamic>(
        path,
        data: body,
        options: Options(extra: {'authRequired': authRequired}),
      );
      return _unwrapResponse(response);
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  /// Wrapper pubblico per GET generico, usato dai moduli specifici di gioco
  /// (es. GameApi) per costruire i propri endpoint sopra ManaApi senza
  /// dover ricreare la logica di autenticazione/error mapping.
  Future<Map<String, dynamic>> get(String path) => _get(path);

  /// Wrapper pubblico per POST generico (vedi [get]).
  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) =>
      _post(path, body);

  Map<String, dynamic> _unwrapResponse(Response<dynamic> response) {
    final status = response.statusCode ?? 0;
    final data = response.data;

    if (status >= 200 && status < 300) {
      if (data is Map<String, dynamic>) return data;
      // Body non oggetto: ritorniamo un wrapper per non perdere il dato.
      return {'data': data};
    }

    // Errore strutturato dal backend? { error: { code, message } }
    if (data is Map && data['error'] is Map) {
      final err = data['error'] as Map;
      throw ManaApiException(
        status: status,
        code: err['code']?.toString(),
        message: err['message']?.toString(),
        raw: data,
      );
    }

    // Errore generico (5xx senza body, o body non strutturato)
    throw ManaApiException(
      status: status,
      message: 'Unexpected response',
      raw: data,
    );
  }

  ManaApiException _mapDioError(DioException e) {
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout ||
        e.type == DioExceptionType.sendTimeout) {
      return ManaApiException(message: 'Timeout: ${e.type.name}');
    }
    if (e.type == DioExceptionType.connectionError) {
      return ManaApiException(message: 'Connection error: ${e.message}');
    }
    return ManaApiException(message: e.message ?? 'Unknown network error');
  }
}

/// Interceptor Dio che inietta automaticamente il JWT di Supabase Auth
/// nell'header Authorization se l'utente e' autenticato.
///
/// Per richieste che impostano `extra['authRequired'] == false` (es. health),
/// se non c'e' JWT salta tranquillamente; per le altre, se non c'e' JWT
/// fallisce subito con un 401 sintetico (evita chiamate inutili al backend).
class _AuthInterceptor extends Interceptor {
  final SupabaseClient _supabase;
  _AuthInterceptor(this._supabase);

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final authRequired = options.extra['authRequired'] != false;
    final session = _supabase.auth.currentSession;

    if (session != null && session.accessToken.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer ${session.accessToken}';
    } else if (authRequired) {
      // Niente sessione e l'endpoint richiede auth: niente chiamata,
      // restituiamo subito un errore.
      handler.reject(
        DioException(
          requestOptions: options,
          type: DioExceptionType.cancel,
          error: 'No active Supabase session, authentication required',
        ),
      );
      return;
    }

    handler.next(options);
  }
}
