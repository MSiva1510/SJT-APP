// ─────────────────────────────────────────────────────────────────────────────
// app_config.dart — non-Supabase endpoints the app calls.
// Override at build time: --dart-define=WEB_BASE_URL=https://staging.example
// ─────────────────────────────────────────────────────────────────────────────

class AppConfig {
  AppConfig._();

  /// The web ERP (Netlify): serves the /api/* functions, e.g.
  /// POST /api/whatsapp/send.
  static const String webBaseUrl = String.fromEnvironment(
    'WEB_BASE_URL',
    defaultValue: 'https://sri-jayam-travels.netlify.app',
  );

  static Uri webApi(String path) {
    final base = webBaseUrl.endsWith('/')
        ? webBaseUrl.substring(0, webBaseUrl.length - 1)
        : webBaseUrl;
    return Uri.parse('$base$path');
  }
}
