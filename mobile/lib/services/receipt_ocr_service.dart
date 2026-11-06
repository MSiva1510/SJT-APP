import 'package:flutter/foundation.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

class ReceiptOcrService {
  const ReceiptOcrService();

  Future<double?> readTotalAmount(String imagePath) async {
    if (kIsWeb) {
      throw UnsupportedError('Receipt OCR is available on Android and iOS.');
    }

    final recognizer = TextRecognizer(script: TextRecognitionScript.latin);
    try {
      final result = await recognizer.processImage(
        InputImage.fromFilePath(imagePath),
      );
      return parseReceiptAmount(result.text);
    } finally {
      await recognizer.close();
    }
  }
}

double? parseReceiptAmount(String text) {
  final primaryLabels = RegExp(
    r'\b(grand\s*total|amount\s*due|net\s*amount|payable|balance\s*due)\b',
    caseSensitive: false,
  );
  final totalLabel = RegExp(
    r'\btotal\b',
    caseSensitive: false,
  );
  final amountPattern = RegExp(
    r'(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)',
    caseSensitive: false,
  );

  final lines = text.split(RegExp(r'[\r\n]+'));
  double? primaryAmount;
  double? totalAmount;
  for (var index = 0; index < lines.length; index++) {
    final line = lines[index];
    final isPrimary = primaryLabels.hasMatch(line);
    if (!isPrimary && !totalLabel.hasMatch(line)) continue;

    final sameLineAmount = amountPattern.allMatches(line).lastOrNull;
    final nextLineAmount = index + 1 < lines.length
        ? amountPattern.firstMatch(lines[index + 1])
        : null;
    final match = sameLineAmount ?? nextLineAmount;
    final amount = match == null
        ? null
        : double.tryParse(match.group(1)!.replaceAll(',', ''));
    if (amount == null || amount <= 0) continue;
    if (isPrimary) {
      primaryAmount = amount;
    } else {
      totalAmount = amount;
    }
  }
  return primaryAmount ?? totalAmount;
}
