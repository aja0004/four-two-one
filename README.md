# 4-2-1 • Dinner Decided

A sleek, minimal, iOS-native-feeling Progressive Web App (PWA) designed for two people to decide what to have for dinner in under 60 seconds using the **4 → 2 → 1** elimination funnel.

## Features

- **4 → 2 → 1 Funnel**:
  1. **User 1** sets cravings & logistics (Meal Type: `Order In`, `Eat Out`, or **both**; Cuisines; optional cravings/dealbreakers note; Price; Delivery Timing or Transport + Travel Time).
  2. **Stage 4**: Backend queries **Google Places API (New)** for currently-open local restaurants using exact Haversine distance & rectangle bounding boxes, filters out recent winners and session rejects, and uses **Gemini** (`@google/genai` Structured Outputs) to curate 4 diverse spots with 1-sentence pitches. User 1 can single-reroll cards (`<1s` from cached `candidatePool`), reroll all 4, edit filters, or confirm the 4.
  3. **Stage 2**: **User 2** picks **2 finalists** to send back to User 1, OR uses their **1 Veto** (strictly max 1 per game) to reject all 4 and send the turn back to User 1.
  4. **Stage 1 & Winner**: **User 1** chooses the winning dinner spot from User 2's 2 finalists, simultaneously revealing the Winner card on both iPhones with a tappable Apple Maps / Google Maps address link and saving to `recent_winners`.
- **Two Play Modes**:
  - **2 iPhones (Live Sync)**: Real-time sync via Supabase Realtime + **1-Tap Household Auto-Lobby** so both iPhones can jump into the active game right inside the installed Home Screen PWA without typing links.
  - **1 iPhone (Pass-the-Phone)**: Full-screen frosted handoff interstitials (`HANDOFF_TO_U2`, `HANDOFF_TO_U1`) and 100% offline/local `localStorage` resilience even before Supabase is configured.

---

## 1. Local Setup

```bash
cd 4-2-1
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```ini
GOOGLE_PLACES_API_KEY=your_google_places_api_key
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
DAILY_PLACES_SOFT_LIMIT=30

# Optional for Pass-the-Phone mode; required for 2-iPhone Live Sync:
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_HOUSEHOLD_ID=default
```

Start the dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

---

## 2. Supabase Setup (Free Tier)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase dashboard, paste the contents of [`supabase/schema.sql`](./supabase/schema.sql), and click **Run**.
3. Copy your **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`) and **anon public key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) from **Project Settings → API** into `.env.local` (and Vercel Environment Variables).

---

## 3. Deploy to Vercel (Zero Config)

1. Push this repository to GitHub/GitLab/Bitbucket or run `npx vercel`.
2. In your Vercel project settings, add the environment variables from `.env.example`:
   - `GOOGLE_PLACES_API_KEY`
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` (`gemini-2.5-flash`)
   - `DAILY_PLACES_SOFT_LIMIT` (`30`)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_HOUSEHOLD_ID` (`default`)
3. Click **Deploy**.

---

## 4. Install on iPhone ("Add to Home Screen")

1. Open your deployed Vercel URL in **Safari** on both iPhones.
2. Tap the **Share** button at the bottom of Safari.
3. Scroll down and tap **Add to Home Screen**.
4. Open **4-2-1** from your iPhone Home Screen — it runs in full-screen standalone mode with automatic dark/light theme and 1-tap Household Auto-Lobby sync!
