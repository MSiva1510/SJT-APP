// ─────────────────────────────────────────────────────────────────────────────
// communication_service.dart
// Provider-independent communication layer for the driver app.
//
// Architecture (per spec):
//   Flutter → CommunicationService → Provider/Edge Function → External
//
// WHATSAPP POLICY:
//   • NO WhatsApp credentials or private API calls live in this APK.
//   • Delivery is delegated to a backend Edge Function that will hold the
//     provider credentials server-side.
//   • Until that function exists and is configured, [whatsAppReady] stays
//     false and sendWhatsApp() returns SendNotConfigured — the UI shows
//     "WhatsApp integration coming soon" and NEVER fakes a successful send.
//
// Enabling later = flip the readiness check to query the backend config
// (e.g. communication_providers table / edge function availability).
// No UI changes required.
// ─────────────────────────────────────────────────────────────────────────────

sealed class CommunicationResult {
  const CommunicationResult();

  /// True only when the message was actually accepted by a real provider.
  bool get delivered => this is CommunicationSent;
}

class CommunicationSent extends CommunicationResult {
  const CommunicationSent(this.providerMessageId);
  final String providerMessageId;
}

class CommunicationNotConfigured extends CommunicationResult {
  const CommunicationNotConfigured(this.userMessage);
  final String userMessage;
}

class CommunicationFailed extends CommunicationResult {
  const CommunicationFailed(this.userMessage);
  final String userMessage;
}

class CommunicationService {
  const CommunicationService();

  /// Whether the WhatsApp backend (Edge Function + provider) is configured.
  /// Currently false — no delivery infrastructure exists yet on the backend.
  bool get whatsAppReady => false;

  /// Sends a WhatsApp message through the backend provider.
  ///
  /// Returns [CommunicationNotConfigured] until the server-side integration
  /// exists. This method must NEVER return success without a real delivery
  /// receipt from a real provider.
  Future<CommunicationResult> sendWhatsApp({
    String? recipientPhone,
    required String templateKey,
    Map<String, String>? variables,
  }) async {
    if (!whatsAppReady) {
      return const CommunicationNotConfigured(
        'WhatsApp integration coming soon',
      );
    }
    // When ready: invoke the Supabase Edge Function here
    // (_client.functions.invoke('send-whatsapp', ...)) — server holds keys.
    return const CommunicationFailed('WhatsApp delivery is not available.');
  }
}
