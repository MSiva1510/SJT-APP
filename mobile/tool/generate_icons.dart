// Regenerate platform launcher icons from tool/assets/app_icon.png.
// Run with: dart run tool/generate_icons.dart (from mobile/).
import 'dart:io';
import 'dart:typed_data';

import 'package:image/image.dart' as img;

const _sourcePath = 'tool/assets/app_icon.png';

final img.Image _icon = img.decodeImage(File(_sourcePath).readAsBytesSync())!;

img.Image _resize(int size) => img.copyResize(
  _icon,
  width: size,
  height: size,
  interpolation: img.Interpolation.average,
);

img.Image _roundedIcon(int size) {
  final source = _resize(size);
  final output = img.Image(width: size, height: size, numChannels: 4);
  img.fill(output, color: img.ColorRgba8(0, 0, 0, 0));

  final radius = size * 0.16;
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      final nearX = x < radius
          ? radius
          : x >= size - radius
          ? size - radius - 1
          : x.toDouble();
      final nearY = y < radius
          ? radius
          : y >= size - radius
          ? size - radius - 1
          : y.toDouble();
      final dx = x - nearX;
      final dy = y - nearY;
      final pixel = source.getPixel(x, y);
      final alpha = dx * dx + dy * dy > radius * radius ? 0 : pixel.a;
      output.setPixelRgba(x, y, pixel.r, pixel.g, pixel.b, alpha);
    }
  }
  return output;
}

img.Image _adaptiveForeground(int size) {
  final badgeSize = (size * 0.64).round();
  final badge = _roundedIcon(badgeSize);
  final canvas = img.Image(width: size, height: size, numChannels: 4);
  img.fill(canvas, color: img.ColorRgba8(0, 0, 0, 0));
  img.compositeImage(
    canvas,
    badge,
    dstX: (size - badgeSize) ~/ 2,
    dstY: (size - badgeSize) ~/ 2,
  );
  return canvas;
}

void _savePng(String path, img.Image image) {
  final file = File(path);
  file.parent.createSync(recursive: true);
  file.writeAsBytesSync(img.encodePng(image));
  stdout.writeln('${file.path} (${image.width}x${image.height})');
}

void _saveIcon(String path, int size) => _savePng(path, _resize(size));

void _saveWindowsIcon() {
  final png = Uint8List.fromList(img.encodePng(_resize(256)));
  final header = ByteData(22)
    ..setUint16(0, 0, Endian.little)
    ..setUint16(2, 1, Endian.little)
    ..setUint16(4, 1, Endian.little)
    ..setUint8(6, 0)
    ..setUint8(7, 0)
    ..setUint8(8, 0)
    ..setUint8(9, 0)
    ..setUint16(10, 1, Endian.little)
    ..setUint16(12, 32, Endian.little)
    ..setUint32(14, png.length, Endian.little)
    ..setUint32(18, 22, Endian.little);
  final file = File('windows/runner/resources/app_icon.ico');
  file.writeAsBytesSync([...header.buffer.asUint8List(), ...png]);
  stdout.writeln(file.path);
}

void main() {
  const androidDensities = {
    'mdpi': 48,
    'hdpi': 72,
    'xhdpi': 96,
    'xxhdpi': 144,
    'xxxhdpi': 192,
  };
  for (final entry in androidDensities.entries) {
    final dir = 'android/app/src/main/res/mipmap-${entry.key}';
    _saveIcon('$dir/ic_launcher.png', entry.value);
    _savePng(
      '$dir/ic_launcher_foreground.png',
      _adaptiveForeground((entry.value * 108 / 48).round()),
    );
  }

  const iosIcons = {
    'Icon-App-20x20@2x.png': 40,
    'Icon-App-20x20@3x.png': 60,
    'Icon-App-29x29@1x.png': 29,
    'Icon-App-29x29@2x.png': 58,
    'Icon-App-29x29@3x.png': 87,
    'Icon-App-20x20@1x.png': 20,
    'Icon-App-40x40@1x.png': 40,
    'Icon-App-40x40@2x.png': 80,
    'Icon-App-40x40@3x.png': 120,
    'Icon-App-60x60@2x.png': 120,
    'Icon-App-60x60@3x.png': 180,
    'Icon-App-76x76@1x.png': 76,
    'Icon-App-76x76@2x.png': 152,
    'Icon-App-83.5x83.5@2x.png': 167,
    'Icon-App-1024x1024@1x.png': 1024,
  };
  const iosDir = 'ios/Runner/Assets.xcassets/AppIcon.appiconset';
  for (final entry in iosIcons.entries) {
    _saveIcon('$iosDir/${entry.key}', entry.value);
  }

  const macIcons = {
    'app_icon_16.png': 16,
    'app_icon_32.png': 32,
    'app_icon_64.png': 64,
    'app_icon_128.png': 128,
    'app_icon_256.png': 256,
    'app_icon_512.png': 512,
    'app_icon_1024.png': 1024,
  };
  const macDir = 'macos/Runner/Assets.xcassets/AppIcon.appiconset';
  for (final entry in macIcons.entries) {
    _saveIcon('$macDir/${entry.key}', entry.value);
  }

  _saveIcon('web/favicon.png', 64);
  _saveIcon('web/icons/Icon-192.png', 192);
  _saveIcon('web/icons/Icon-512.png', 512);
  _saveIcon('web/icons/Icon-maskable-192.png', 192);
  _saveIcon('web/icons/Icon-maskable-512.png', 512);
  _saveWindowsIcon();

  stdout.writeln('Generated Android, iOS, macOS, web, and Windows icons.');
}
