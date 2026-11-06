# Sri Jayam Travels Mobile

The repository contains the Sri Jayam Travels Flutter application for Android
and iOS. It supports driver workflows for trips, bookings, GPS tracking,
attendance, documents, notifications, expenses, earnings, and emergency
actions, along with manager workflows for trips, fleet, bookings, expenses,
attendance, customers, drivers, vehicles, invoices, documents, notifications,
WhatsApp, and reports.

## Requirements

- Flutter SDK compatible with the Dart constraint in `mobile/pubspec.yaml`
- Android Studio or Xcode for the target mobile platform

## Run the app

```sh
cd mobile
flutter pub get
flutter run
```

To check the mobile application:

```sh
cd mobile
flutter analyze
flutter test
```

## App configuration

Supabase settings are in
[`mobile/lib/core/config/supabase_config.dart`](./mobile/lib/core/config/supabase_config.dart).
The app's `WEB_BASE_URL` build define points to the serverless API host used for
manager WhatsApp messages; it is not a web-app build setting.

## Backend services

- `supabase/migrations/` contains database migrations for the mobile app's
  shared Supabase project.
- `netlify/functions/whatsapp-send.js` provides the manager WhatsApp API used
  by the mobile app. The Netlify configuration deploys this function without a
  web application.

Configure these values in the Netlify function environment. Never put a
service-role key or Watobot API key in the mobile app:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `WATOBOT_API_KEY`, `WATOBOT_PHONE_NUMBER_ID`
- `WATOBOT_INVOICE_TEMPLATE`, `WATOBOT_BOOKING_NOTIFICATION_TEMPLATE`,
  `WATOBOT_BOOKING_CONFIRMATION_TEMPLATE`
- Optional: `WATOBOT_API_URL` and `WATOBOT_TEMPLATE_LANGUAGE`

Create and get Meta approval for each WhatsApp Utility template in Watobot.
Each configured template must have a body with one text parameter (`{{1}}`).
Manager sends use one shared limit of 10 attempts per India Standard Time
calendar day across all managers and admins.

## Repository layout

- `mobile/` — Flutter app and tests for Android and iOS
- `supabase/` — database migrations and backend tests
- `netlify/functions/` — serverless API used by the mobile app
