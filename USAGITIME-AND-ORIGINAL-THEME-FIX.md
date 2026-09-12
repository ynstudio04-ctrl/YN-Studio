# USAGITIME + Original Theme Fix

- Restored the customer app's default visual baseline to the clean YN Studio purple/white theme.
- Removed the global `finish.css` import that was overriding the original page styling.
- Rebuilt the customer home layout styling around the supplied USAGITIME reference image: cream background, rounded cream/pink cards, large welcome panel, search/camera row, customer ID card, Orders/Wallet cards, 4+1 quick actions, recent order area, and bottom navigation.
- Added a USAGITIME header character while keeping the existing transparent Usagi artwork for the other placements.
- Versioned the theme localStorage key so an old saved theme selection does not force the newly restored default theme on existing devices.
