# Flutter Mobile UI and Development Standards

## Before implementing a UI
1. Inspect the existing Flutter screen, shared widgets, theme, and navigation.
2. Preserve existing behavior, business logic, Supabase integrations, and routes.
3. Use platform conventions and the existing design system; avoid duplicating UI.

## Quality requirements
- Keep layouts usable on supported Android and iOS screen sizes.
- Preserve light and dark theme behavior where it exists.
- Include loading, empty, error, and success states.
- Avoid unnecessary dependencies and duplicated components.
- Run relevant Flutter analysis and tests, and report unresolved issues honestly.