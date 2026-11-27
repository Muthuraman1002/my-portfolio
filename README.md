# My Portfolio — iOS and Android app

Your Kotak Neo shares and Tata mutual funds on your phone, with flags that help you decide what to do next.
One Expo (React Native) project builds both the iPhone and the Android app.

**It only reads.** The app never calls Kotak's order APIs, so it can't buy or sell anything.

## What's in it

- **Overview**: everything you own, today's change, total profit/loss, "Needs your attention" flags, where your money is, and a returns comparison against the Nifty 50.
  A **Gold and silver** card shows live MCX gold (₹/10 g) and silver (₹/kg), COMEX gold and silver ($/oz), the US dollar in rupees, and the **expected gold rate**: COMEX gold × USD/INR converted to ₹ per 10 g plus 6% import duty, with how far MCX is above or below it. It refreshes every minute.
- **Shares**: value, your yearly return (XIRR) vs the same money in the Nifty 50, a performance chart, and your holdings.
  You can also check any NSE stock's price.
- **Funds**: your Tata mutual funds with units, average cost, NAV, profit/loss, XIRR vs the Nifty 50, and 1-year and 3-year fund returns.
- **Detail views**:
  - Stocks: price chart with 50/200-day averages and your cost, target and stop lines; key numbers; your plan; your purchase dates; news.
  - Funds: NAV chart with your purchases marked, key numbers, every transaction, news.
- **Accounts**: where you connect Kotak Neo and import your CAMS statement, plus app lock (Face ID / fingerprint) and demo data.

## Run it on your phone (quickest way)

1. Install Node.js 20 or newer on your computer.
2. In this folder, run:
   ```bash
   npm install
   npx expo start
   ```
3. Install **Expo Go** from the App Store or Play Store, then scan the QR code shown in the terminal.
4. Tap **Try with demo data** to look around, or go to **Accounts** to connect your own.

Your phone and computer need to be on the same Wi-Fi network.

## Connect Kotak Neo

1. In the Kotak Neo app: **More → Trade API**, create an application and copy its **access token**.
2. On the same screen, choose **TOTP Registration** and scan the QR code with Google or Microsoft Authenticator.
3. In this app's **Accounts** tab, enter the access token, your registered mobile number and your client code (UCC), then log in with the 6-digit code.
   - Optional: save your **MPIN** and the **TOTP secret** (the text key under the QR code). With both saved, the app logs in by itself each day.

These details are stored only in the phone's secure storage (iOS Keychain / Android Keystore) and are sent only to Kotak.
No static IP is needed: Kotak requires one only for placing orders.

## Add your Tata mutual funds (CAMS)

CAMS, Tata Mutual Fund's registrar, has no API for investors, so there are no CAMS login details.
Instead, you import your official statement: 

1. On camsonline.com: **Investors → Statements → CAS – CAMS+KFintech** (or use mfcentral.com).
2. Choose **Detailed**, then a specific period from your first investment until today, and set a password.
3. Save the emailed PDF to your phone's Files.
4. In the app, choose **Import statement**, pick the PDF and enter its password.

The PDF is read on the phone and isn't uploaded.
The PDF reader (pdf.js) is downloaded from a public CDN the first time you import.
Only Tata funds are kept; change **Keep funds from** in Accounts to keep others, or leave it empty for all.
Import a fresh statement after new SIPs or redemptions. NAVs update by themselves.

## Build installable apps

Use Expo's EAS Build service (free tier available):

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview   # an .apk you can install directly
eas build --platform ios                          # needs an Apple Developer account
```

Before building, change `bundleIdentifier` and `package` in `app.json` from `com.yourname.myportfolio` to your own.

## Where the numbers come from

| What | Source |
| --- | --- |
| Holdings, prices, daily history | Your Kotak Neo account (Trade API) |
| Nifty 50 | Yahoo Finance's public chart data |
| COMEX gold and silver, USD/INR | Yahoo Finance (GC=F, SI=F, USDINR=X) |
| MCX gold and silver | Your Kotak Neo account: nearest-expiry GOLD and SILVER futures (needs a Kotak login) |
| Mutual fund units and transactions | Your CAMS/KFintech CAS PDF, or what you add by hand |
| Fund NAVs | mfapi.in (AMFI data); AMFI's NAV file to match ISINs |
| News | Google News (India) |

Flags describe what the numbers show. They aren't buy or sell advice.

## Files

```
App.js                    tabs, app lock, sheets
src/data.js               loads and calculates everything
src/kotak.js              Kotak Neo REST client (read-only)
src/cas/parse.js          CAMS/KFintech statement parser
src/cas/PdfTextReader.js  reads the PDF on the phone
src/mf.js                 fund cost, XIRR, flags
src/analytics.js          indicators, stock flags, performance
src/market.js             Nifty, NAVs, news
src/storage.js            secure storage and local files
src/totp.js               6-digit login codes from your TOTP secret
src/demo.js               made-up demo data
src/screens/, src/components/   the screens and building blocks
```
