# CodEX AI — Terminal Environment

CodEX AI is a terminal-inspired, mobile-first web workspace powered by the Gemini API. It is built with React, TypeScript, Vite, GSAP, Firebase (optional cloud identity), and Capacitor (Android wrapper).

## Features

- 8-second animated startup sequence on a fresh signed-out session
- Name/password login and account creation
- Local Mode with a salted PBKDF2 password hash stored in the current browser
- Optional Firebase Authentication + Firestore username reservation for cross-device accounts
- Smooth welcome transition after login
- Classic dark terminal layout with phosphor, amber and ice themes
- Responsive sidebar that becomes a slide-out navigation drawer on phones
- Live 24-hour clock with seconds and date
- Gemini API key setup, stored locally on the device
- Dynamic Gemini model catalogue loaded through the API
- Multi-turn Gemini conversations
- Animated `Thinking...` indicator and typewriter-style response reveal
- Copy entire AI responses
- Copy individual code blocks
- Save generated code blocks to local Files and download them
- Local usage meter based on Gemini response token metadata
- Customizable local token budget and randomized 15–90 minute local pause when it is reached
- Usage breakdown for input tokens, output tokens and requests
- Status diagnostics for browser-side configuration
- Conversation history saved locally per username
- Command history recalled with the Up/Down arrow keys
- Local command aliases: `help`, `clear`, `usage`, `models`, `status`, `settings`, `config`, `history`, `files`, `snippets`, `time`, `date`, `whoami`, `theme`, `export`, `new`, `logout`
- Downloadable session transcript
- Personal snippets library
- PWA manifest and service-worker support
- GitHub Pages deployment workflow
- GitHub Actions workflow that builds a debug Android APK

Panduan penggunaan dari Android tersedia di [`MULAI_DI_HP.md`](./MULAI_DI_HP.md).

## Run locally

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. To create a production web build:

```bash
npm run build
npm run preview
```

## Gemini API setup

1. Create a Gemini API key in Google AI Studio: https://aistudio.google.com/app/apikey
2. Open CodEX AI → Settings.
3. Paste the key and select a model.
4. Open Models and refresh the catalogue to load the models available to that key.

CodEX sends requests directly from the user's browser/app to Google's Gemini API using the `x-goog-api-key` request header. The key is saved in local browser storage on that device. It is not embedded in the repository, but anyone with access to the same browser profile can inspect local app storage. Use a personal key; do not paste a shared or organization key into a public device. Rotate a key if it is exposed.

## Usage meter behavior

Gemini responses can include `usageMetadata` with prompt, candidate and total token counts. CodEX adds those reported counts to its local counter and compares the result against the budget configured in Usage. At 100%, it pauses new requests in this browser for a randomized 15–90 minutes and then resets the local meter.

This meter is **not** Google's live project quota, billing usage, or rate-limit meter. Google's RPM, TPM and RPD limits vary by model and project and must be checked in Google AI Studio. Google documents that request/day quota resets use the Pacific-time day boundary.

## Cloud accounts with Firebase

Local Mode works immediately but its account registry only exists in that browser/app installation. To use the same unique username on multiple devices, configure Firebase first. Follow [`FIREBASE_SETUP.md`](./FIREBASE_SETUP.md) and publish [`firestore.rules`](./firestore.rules).

Firebase Authentication must have Email/Password enabled. Firestore rules prevent clients from overwriting username reservations. The account UI still asks only for a username and password; a synthetic internal email address is created for Firebase Authentication.

## GitHub Pages deployment

1. Create a GitHub repository and upload the contents of this folder to the repository root.
2. Ensure the default branch is named `main` (or edit `.github/workflows/pages.yml`).
3. Open **Settings → Pages** and set **Source** to **GitHub Actions**.
4. Open **Actions** and run **Deploy CodEX AI to GitHub Pages**, or push a commit to `main`.
5. When the workflow succeeds, open the Pages URL shown in the deployment summary.

The Vite build uses a relative base path, so the app supports project Pages URLs such as `https://username.github.io/repository/`.

## Build an Android APK

The ZIP includes a GitHub Actions workflow; the Android Gradle project is generated during the workflow to keep the source archive smaller.

1. Push this project to GitHub.
2. Open **Actions → Build CodEX AI Android APK**.
3. Tap **Run workflow** and confirm.
4. When the workflow finishes, open the run and download the `codex-ai-android-debug-apk` artifact.
5. Extract the artifact ZIP and install `app-debug.apk` on your Android device.

This workflow creates a **debug APK** for testing, not a signed Play Store release. The APK requires an internet connection for Gemini and cloud authentication. Android permissions and signing for store publication are intentionally not configured.

## Project structure

```text
codex-ai-terminal/
├── .github/workflows/       GitHub Pages + Android APK workflows
├── public/                  Favicon, PWA icons and static assets
├── src/
│   ├── lib/                 Authentication, Gemini API and local storage
│   ├── App.tsx              Application screens and terminal interactions
│   ├── main.tsx             React entry point
│   └── styles.css           Responsive terminal design system
├── capacitor.config.ts      Capacitor Android wrapper configuration
├── firestore.rules          Username/profile security rules
├── firebase.json            Firebase CLI rules mapping
├── vite.config.ts           Vite + PWA build configuration
├── FIREBASE_SETUP.md        Cloud account setup
└── README.md
```

## Limitations

- GitHub Pages is static hosting; it does not run a private backend. Gemini requests are made directly from the client using the API key the user enters.
- The local account mode is not a server database and cannot guarantee global username uniqueness. Firebase mode is required for that.
- Usage percentages are based on the local budget set in CodEX, not an exact view of the Google account's quota.
- Browser storage is local to the browser/app installation. Clearing app data removes local history, files, snippets and Local Mode accounts.
- CodEX is a code assistant interface, not a full shell. It does not execute arbitrary operating-system commands or automatically edit device files.
