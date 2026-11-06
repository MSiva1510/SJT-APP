# Sri Jayam Travels

Sri Jayam Travels is a travel operations platform for managing bookings, trips,
drivers, vehicles, expenses, and fleet activity. The repository contains a web
ERP dashboard and a companion Flutter app for drivers and managers. Both
applications use Supabase for shared data and authentication.

## Applications

### Web ERP

The root application is a React single-page app built with Vite. It provides
role-based screens for administrators, managers, and drivers, including:

- Trip and booking workflows, customers, drivers, and vehicles
- Attendance, expenses, invoices, payroll, reports, and documents
- GPS fleet monitoring, GPS history, route replay, and fleet analytics
- Communications, notifications, and administrative settings
- Public booking and driver-facing dashboard and trip tools

### Mobile app

The Flutter app is in [`mobile/`](./mobile/). It provides driver workflows for
trips, bookings, GPS tracking, attendance, documents, notifications, expenses,
earnings, and emergency actions. Manager screens include trips, fleet, bookings,
expenses, attendance, customers, drivers, vehicles, invoices, documents, and
notifications, WhatsApp, and reports.

## Brand assets

- The horizontal in-app logo is `mobile/assets/images/brand_logo.png`
  (1536 x 768 px).
- The square launcher-icon source is `mobile/tool/assets/app_icon.png`
  (768 x 768 px). To regenerate platform icons, run
  `dart run tool/generate_icons.dart` from `mobile/`.
- Generated launcher icons are placed in the native platform asset locations,
  including `mobile/android/app/src/main/res/`,
  `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/`,
  `mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset/`,
  `mobile/web/`, and `mobile/windows/runner/resources/app_icon.ico`.

## Technology

- **Web:** React, React Router, Vite, Tailwind CSS, Leaflet
- **Mobile:** Flutter and Dart, Riverpod, GoRouter, Flutter Map
- **Backend:** Supabase (Postgres, Auth, Storage, and Realtime)
- **Deployment:** Netlify configuration is provided at the repository root

## Getting started

### Web

Requirements: Node.js 20 or later and npm.

```sh
npm install
npm run dev
```

To create a production build:

```sh
npm run build
```

For Supabase-backed web features, configure `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` in a local `.env` file. Do not put service-role keys
or other server secrets in client-side environment variables.

### Flutter

Install the Flutter SDK, then run these commands from `mobile/`:

```sh
flutter pub get
flutter run
```

To check the mobile application:

```sh
flutter analyze
flutter test
```

The mobile app's Supabase settings are in
[`mobile/lib/core/config/supabase_config.dart`](./mobile/lib/core/config/supabase_config.dart).
Its web API base URL can be overridden at build time with
`--dart-define=WEB_BASE_URL=https://your-web-host`.

### Manager WhatsApp (Watobot)

Apply the migrations in `supabase/migrations/` before enabling SOS auto-close
or manager WhatsApp sending. Configure these environment variables in Netlify
Function settings; never put the Watobot or Supabase service-role key in the
Flutter app or a `VITE_` variable:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `WATOBOT_API_KEY`, `WATOBOT_PHONE_NUMBER_ID`
- `WATOBOT_INVOICE_TEMPLATE`, `WATOBOT_BOOKING_NOTIFICATION_TEMPLATE`,
  `WATOBOT_BOOKING_CONFIRMATION_TEMPLATE`
- Optional: `WATOBOT_API_URL` and `WATOBOT_TEMPLATE_LANGUAGE` (defaults to
  Watobot's API and `en`)

Create and get Meta approval for each WhatsApp Utility template in Watobot.
Each configured template must have a body with one text parameter (`{{1}}`).
Manager sends use one shared limit of 10 attempts per India Standard Time
calendar day across all managers and admins. A provider attempt reserves a
daily slot even if delivery fails, avoiding accidental over-sending on retries.
Drivers do not have an outbound WhatsApp action.

## Repository layout

- `src/` — React web application
- `netlify/functions/` — Netlify serverless functions
- `supabase/migrations/` — database migrations
- `supabase/tests/` — Supabase-related tests
- `mobile/` — Flutter application and its tests

## Shared data

The web and mobile applications integrate with the same Supabase project and
share operational data such as trips, bookings, attendance, GPS records, and
documents. Keep database schema changes in Supabase migrations and preserve
the role-based access policies when changing data workflows.
