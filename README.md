# T20 WC 2026 Fantasy (Local)

This is a local full-stack demo:
- React (Vite) frontend
- Express + MongoDB backend

## Prereqs
- Node.js 18+
- MongoDB running locally

## Setup
1. Copy env files:
   - server: copy `server/.env.example` to `server/.env`
   - client: copy `client/.env.example` to `client/.env`

2. Install dependencies:
   - `npm install`
   - `npm install --prefix server`
   - `npm install --prefix client`

3. Seed players:
   - `npm run seed`

4. Run locally:
   - `npm run dev`

Frontend: http://localhost:5173
Backend: http://localhost:5000/api/health
