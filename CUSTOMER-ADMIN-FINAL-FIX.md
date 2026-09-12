# YN Studio final UI/runtime fixes

## Fixed in this pass
- Removed the customer desktop phone-only gate that could present as an empty/unstyled page.
- Kept the customer ErrorBoundary as a visible recovery screen instead of a blank crash.
- Added the missing `/customer/orders/:id/payment` route for the existing customer payment page.
- Added a cinematic dark purple customer visual system with animated background glow, page transitions, hover/press motion, glass cards, focus states and reduced-motion support.
- Forced the admin application surfaces, tables, inputs, modals and common cards into the black/purple visual system so white panels do not reappear from older CSS rules.
- Added Node 22.20.0 version files to all three deployable services.
- Static checks: server syntax passed, all package.json files parsed, and all relative imports resolve.

## Important
A full Vite build could not be executed in the isolated environment because the npm registry package tarballs were not available locally. Run `npm ci && npm run build` in each app on Windows before pushing.
