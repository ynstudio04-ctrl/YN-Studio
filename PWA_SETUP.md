# YN Studio PWA setup

## 1. Run the apps

Use the existing Windows setup/run scripts in this project. For production, serve the built `client` and `customer` apps over HTTPS (or localhost while testing).

The browser must be able to reach your server/API from the device. A PWA does not make the backend run on the iPad; it is an installable web app shell that connects to your server.

## 2. Install YOUR admin app on Windows PC

1. Start the YN Studio admin/client web app.
2. Open its URL in Chrome or Microsoft Edge.
3. Sign in.
4. Look for the install icon in the address bar, or open the browser menu and choose **Install YN Studio Admin** / **Install app**.
5. Confirm Install.
6. Launch **YN Studio Admin** from the Windows Start menu. It opens in its own app window.

## 3. Install YOUR admin app on iPad

Use Safari on the iPad.

1. Open the admin/client URL.
2. Sign in if required.
3. Tap the **Share** button.
4. Tap **Add to Home Screen**.
5. Name it **YN Studio**.
6. Tap **Add**.
7. Open YN Studio from the new Home Screen icon.

Safari's Home Screen web app opens without the normal Safari tab/address-bar UI. iPadOS must be online to reach the live server/API.

## 4. Give customers their customer link

Give customers only the customer portal URL. They can open it on an iPhone or Android phone and sign in. The customer app rejects desktop/iPad-sized access and shows a phone-only message.

For real privacy, keep customer authentication enabled. A URL by itself cannot be made secret: anyone who receives/copies it can open it. The login is the actual access control.

## 5. Add the customer app to a phone

### iPhone
Safari -> customer link -> Share -> Add to Home Screen -> Add.

### Android
Chrome -> customer link -> browser menu -> **Install app** or **Add to Home screen** (wording varies by Chrome/device) -> confirm.

## 6. Important deployment rule

Use HTTPS for the real deployed site. Service workers/PWA installation are restricted by browsers to secure contexts, with localhost allowed for development.

The service workers deliberately do NOT cache API/data responses. Orders, statuses, payments, receipts and loan balances must remain live.
