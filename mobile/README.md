# Cana Bids — mobile app

One codebase (React Native via Expo) that builds both the **iOS** and **Android** app.
It reads the same live care tenders as the website, from the same Netlify function.

## Run it on your phone

1. Install [Node](https://nodejs.org) (already installed on the work machine).
2. Install **Expo Go** from the App Store or Play Store on your phone.
3. In a terminal:

```bash
cd mobile
npm install      # first time only, takes a few minutes
npx expo start
```

4. A QR code appears. Scan it with your phone camera (iPhone) or the Expo Go app
   (Android). The app opens on your phone, with your real tenders in it.

Your phone and computer need to be on the same wifi.

## What is built

| Screen | State |
|---|---|
| Opportunities | **Live.** Pulls real care tenders from `get-tenders`, with search and filters |
| Tender detail | **Live data**, questions list is placeholder until questions are stored per tender |
| Generating | Screen and flow built; progress is **simulated on a timer** for now |
| Bid ready | Layout built; answer text is **placeholder** |
| Evidence | Layout built; documents are **placeholder**, not yet wired to the vault |
| Alerts / Profile | Placeholders |

## Still to do before the stores

- Sign in with Supabase (same accounts as the website)
- Wire generation to `generate-cana-background` and poll the real job
- Wire the evidence list to the vault documents
- App icon and splash screen artwork
- Push notifications for new matching tenders
- Apple Developer account (£79/yr) and Google Play account (one-off $25)
- Store listing: screenshots, description, privacy policy

## Payments, important

Apple and Google take **15–30%** of anything bought inside an app. This app is
therefore **sign-in only**: customers buy on the website, then log in here to
generate. The app never takes payment, so there is no commission to pay. Do not
add a "buy" button to the app without checking the store rules first.
