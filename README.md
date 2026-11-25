# Praise Him Autos – website + booking backend + admin

One small Node app (Express + built-in SQLite). No build step, no external database.

## Run
    npm install
    ADMIN_PASSWORD='choose-a-strong-one' npm start      # http://localhost:3000 , admin at /admin
(If ADMIN_PASSWORD is not set, a random one is printed once and saved in data/FIRST_LOGIN.txt.)
Needs Node 22.13+. Set PORT if needed. Data and uploaded photos live in ./data (back it up).

## What the client gets
- Public site: car listings with search/filters/gallery, rentals, chauffeur booking, pre-order requests, contact, WhatsApp + call buttons, mobile-first.
- Admin (/admin): dashboard, enquiries inbox (status, notes, WhatsApp reply button, CSV export), add/edit/sell/hide cars with photo upload, rental fleet and rates, site settings, password change.
- Security: scrypt password hashing, signed HttpOnly session cookie, login + form rate limiting, spam honeypot, upload type/size limits, CSP headers.

## Before showing the client
Sample cars/fleet are seeded (marked SAMPLE). Replace photos and prices with the client's own, and confirm phone, address and hours in Admin > Settings. Only the phone number and "GRA Ikeja" came from their public posts.

## Deploy
Any VPS or a host with a persistent disk (Railway, Render, Fly, a Lagos VPS) behind HTTPS. Put ./data on persistent storage. SQLite file = app.db.

## Test
    npm test

## Vercel (demo only)
Vercel's disk is temporary, so on Vercel the data lives in /tmp and RESETS on cold starts (cars, photos, enquiries vanish).
Use it only to show a demo; set env vars ADMIN_PASSWORD and Node 22.x. For the real client use Render, Railway or Fly with a persistent disk mounted at ./data (or set DATA_DIR).
