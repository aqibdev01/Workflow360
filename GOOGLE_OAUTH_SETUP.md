# Google OAuth Setup Guide

Follow these steps to enable "Continue with Google" on the login page.

## Step 1 — Google Cloud Console: Create Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top → **New Project**
3. Name it `Workflow360` → **Create**

## Step 2 — OAuth Consent Screen

1. Left menu → **APIs & Services** → **OAuth consent screen**
2. Choose **External** → **Create**
3. Fill in:
   - App name: `Workflow360`
   - User support email: your email
   - Developer contact email: your email
4. Click **Save and Continue** through all remaining steps (skip scopes and test users)

## Step 3 — Create OAuth Credentials

1. Left menu → **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `Workflow360 Web`
5. Under **Authorized redirect URIs**, add:
   ```
   https://YOUR_SUPABASE_PROJECT_REF.supabase.co/auth/v1/callback
   ```
   > Replace `YOUR_SUPABASE_PROJECT_REF` with the project ref from Supabase → Settings → API (the part before `.supabase.co` in your project URL)
6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

## Step 4 — Paste into Supabase

1. Supabase dashboard → **Authentication** → **Providers** → **Google**
2. Paste the **Client ID** and **Client Secret**
3. Click **Save**

## Step 5 — Publish for All Users

1. Go back to **APIs & Services → OAuth consent screen**
2. Click **Publish App** → **Confirm**

This moves the app from Testing to Production so any Google account can sign in — no manual whitelisting needed. Google does not require a review for basic sign-in (name + email only).

## Re-enable the Button

Once setup is complete, un-comment the Google button in `app/auth/login/page.tsx` (search for `GOOGLE_OAUTH_HIDDEN`).
