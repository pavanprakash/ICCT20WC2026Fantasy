# Tech Stack Documentation

This document summarizes the technologies, libraries, and infrastructure used in this project, based on the current codebase.

## Overview
- **Frontend**: React (Vite)
- **Backend**: Node.js + Express (ESM)
- **Database**: MongoDB (Mongoose)
- **Scheduling**: node-cron
- **External Data**: CricAPI

## Frontend
Location: `client/`

- **Framework**: React 18
- **Build Tool**: Vite 5
- **Routing**: React Router DOM 6
- **HTTP Client**: Axios
- **Styling**: Global CSS in `client/src/styles/global.css` (custom CSS, no CSS framework)

### Frontend Scripts
- `npm run dev` — local dev server (Vite)
- `npm run build` — production build
- `npm run preview` — preview production build

## Backend
Location: `server/`

- **Runtime**: Node.js (ESM modules via `"type": "module"`)
- **Framework**: Express 4
- **Auth**: JSON Web Tokens (`jsonwebtoken`)
- **Password Hashing**: bcrypt
- **Database ODM**: Mongoose
- **Env Config**: dotenv (loads `.env` from common locations)
- **Scheduling**: node-cron

### Backend Scripts
- `npm run dev` — nodemon dev server
- `npm run start` — production server
- `npm run seed` — seed database
- `npm run sync:fantasy` — pull scorecards and compute fantasy points
- `npm run sync:match -- <matchId>` — compute points for a single match
- `npm run manual:match` — manual match points overrides
- `npm run backfill:supersub` — persist super-sub results
- `npm run backfill:playing-xi` — apply Playing XI bonus to existing match points
- `npm run backfill:player-img` — store player images from CricAPI
- `npm run auto-submit:match -- <matchId>` — auto-submit missing teams for one match
- `npm run auto-submit:fix-match -- <matchId>` — repair auto-submissions for one match

## Database
- **MongoDB** with **Mongoose** models.
- Primary models include:
  - `User`
  - `Player`
  - `Team`
  - `TeamSubmission`
  - `League`
  - `FantasyMatchPoints`

## External Services
- **CricAPI** (scorecards, player info, matches)
  - Used for match scorecards and player images.
  - Common endpoints:
    - `/v1/match_scorecard`
    - `/v1/match_info`
    - `/v1/players`
    - `/v1/players_info`

## Scheduling & Jobs
Backend scheduled tasks (see `server/src/index.js`):
- Auto-submit missing teams periodically.
- Daily league updates at 13:00 and 18:00 UTC (1pm & 6pm GMT).

## Environment Variables
Typical keys (see `server/.env`):
- `MONGODB_URI`
- `JWT_SECRET`
- `CRICAPI_KEY`
- `CRICAPI_SERIES_KEY`
- `CLIENT_ORIGIN`

If you want, I can expand this with deployment/hosting details and build pipelines.
