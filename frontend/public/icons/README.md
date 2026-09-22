# Icons and logo marks

These are the real assets, not placeholders. `icon-512.png` is the Gachard
logogram that `components/Logo.tsx` renders in the navbar and footer, so
replacing it changes the app's identity everywhere, not just the PWA install
prompt.

| File | Used by |
|------|---------|
| `icon-192.png`, `icon-512.png` | PWA manifest, and `icon-512.png` is the in-app logo mark |
| `icon-512.webp` | smaller variant for surfaces that do not need PNG |
| `gachard-logo.*`, `gachard-logo-full.*` | full lockups, PNG and WebP |

Third-party marks live in `public/brand/` instead, kept separate because they
belong to other people: `monad.webp` in the footer, `privy.webp` on `/profile`
and `/wallet`. Both are used as supplied — scaled only, never recoloured.
