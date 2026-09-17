<p align="center">
  <img src="frontend/public/app-logo.png" alt="Charge" width="72" />
</p>

<h1 align="center">Charge</h1>

<p align="center"><strong>A mobile-first EV charging product for Philippine drivers and network owners.</strong></p>
<p align="center">Discovery · Navigation · Checkout · Sessions · Network operations · AI assistance</p>

Charge is an end-to-end EV charging product spanning the driver experience, network operations, backend workflows, geospatial interfaces, payment-state handling, and bounded AI assistance.

It demonstrates full-stack product engineering across interface design, business rules, integrations, AI-assisted workflows, deployment, and operational reliability.

The work began as a private client commission exploring EV charging market entry in Southeast Asia. This public edition is an independently extended, sanitized implementation.

## What it does

### Charge an EV

- Saves a vehicle, plug type, and current battery level.
- Shows compatible synthetic charging stations on Google Maps.
- Compares availability, speed, price, approximate distance, and estimated charging time.
- Accepts natural-language charging requests with destination, budget, and battery constraints.
- Handles sandbox QR Ph or card authorization, settlement, and receipt flows.
- Runs arrival, plug-in, charging, cancellation, recovery, completion, and receipt workflows.
- Shows final energy delivered, session duration, charging cost, and receipt.

### Run a network

- Adds charging locations from map pins.
- Registers chargers by serial number and OCPP version.
- Configures plugs, power, price per kWh, and listing availability.
- Shows active and completed demo sessions across synthetic locations.
- Tracks revenue, delivered energy, and charger status from demo records.
- Uses AI to identify which location needs attention, why, and what revenue may be exposed.

## Charging flow

```text
Find station → Navigate → Arrive and plug in → Authorize sandbox payment
→ Start simulated session → Monitor → Complete → Settle → Receipt
                                           ↓
                          Connector state and network records update
```

## How it stays reliable

- Calculations, permissions, payment state, charger availability, and session transitions remain deterministic.
- The configured LLM turns natural-language questions into structured intent; application code validates requests before using them.
- Station ranking, cost estimates, and network exposure calculations come from application logic and current records.
- Charging sessions use a deterministic state machine with explicit transition rules.

## Architecture

```text
Driver / network owner
         ↓
 React / TypeScript
      Vercel
         ↓
 ┌───────┴────────┐
 ↓                ↓
Google Maps    FastAPI
                  ↓
          ┌───────┴────────┐
          ↓                ↓
     PostgreSQL        Together AI
```

**Stack:** React, TypeScript, Vite, Tailwind CSS, Framer Motion, FastAPI, SQLAlchemy, Alembic, PostgreSQL, SQLite, Google Maps JavaScript API, Together AI, Vercel, and Railway.

## Live demo

Open **[charge.hermitedge.com](https://charge.hermitedge.com)** and use Quick access to explore both sides of the product:

- **Sam Rivera** — EV driver with a saved BYD Atto 3.
- **Nina Lim** — owner of a multi-location charging network.

## Implementation boundaries

| Area | Public edition |
| --- | --- |
| Maps | Google Maps JavaScript API powers the live map, geolocation, station pins, and location selection. Navigation hands the selected trip off to Google Maps. |
| Distance and ETA | Uses coordinate-based estimates only; there is no live-traffic ETA. Google Maps provides the final road route after handoff. |
| Stations | Uses realistic synthetic records around Metro Manila; no client or third-party operational data is included. |
| Charger connection | Charger registration and OCPP metadata are implemented, but no physical charger is connected to this repository. |
| Vehicle connection | Vehicle and battery data are entered manually; no vehicle-manufacturer account is linked. |
| Payments | QR Ph and card authorization, settlement, and receipts are sandbox flows; no funds are transferred. |
| Reservations | There is no advance booking. An available connector is not held while the driver is travelling. |
| Charging session | Uses a deterministic state machine with realistic session values; charger-originated OCPP events are simulated. |
| AI | The configured LLM interprets trip and network questions. Application code validates inputs, ranks results, and estimates cost or per-cycle exposure from demo records. |

In a hardware deployment, the charger connects to a charging-management backend over OCPP and reports availability, status, and meter values. The car connects physically to the charger; Charge remains the customer and network-management interface.

## Run locally

Requirements: Node.js 24 and Python 3.11.

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000`.

### Frontend

```bash
cd frontend
npm ci
cp .env.example .env
npm run dev
```

Open the local Vite development URL shown in the terminal.

Configure credentials only in local or deployment environment variables:

```dotenv
# frontend/.env
VITE_API_URL=http://localhost:8000
VITE_GOOGLE_MAPS_API_KEY=
VITE_GOOGLE_MAP_ID=

# backend/.env
TOGETHER_API_KEY=
TOGETHER_MODEL=Qwen/Qwen3.5-9B
```

Restrict the Google Maps browser key to approved HTTP referrers and the Maps JavaScript API. Keep the Together AI key and JWT secret on the backend only.

With `DEMO_AUTH_ENABLED=true`, the synthetic recording workspace is seeded idempotently on the first demo sign-in. `VITE_GOOGLE_MAP_ID` is optional.

## Verification

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest -q
alembic upgrade head

cd ../frontend
npm run type-check
npm run lint
npm run build
```

## Deployment

- Deploy `frontend/` to Vercel using Vite with `dist` as the output directory. Set `VITE_API_URL` and a website-restricted `VITE_GOOGLE_MAPS_API_KEY`.
- Deploy `backend/` to Railway using Railpack, `bash start.sh` as the start command, and `/readyz` as the health check.
- Attach Railway PostgreSQL and configure `ENV=production`, `DATABASE_URL`, a strong `SECRET_KEY`, and the exact frontend origin in `ALLOWED_ORIGINS`.
- Set `DEMO_AUTH_ENABLED=true` for the public walkthrough.
- Store `TOGETHER_API_KEY` and `TOGETHER_MODEL` in backend deployment environment variables for AI features.
- `REDIS_URL` is optional.
- The Python runtime is pinned in `backend/.python-version`.
- The Node runtime is pinned in `frontend/package.json` and `frontend/.nvmrc`.

## Repository status

Credentials, managed-service state, client material, portfolio screenshots, and the recorded walkthrough are not committed to this repository.

## License and trademarks

GCash, Maya, QR Ph, Visa, Mastercard, Google Maps, and other product names or marks belong to their respective owners.

Third-party marks and logo assets are excluded from the source-code license. Their appearance depicts the interface and does not imply endorsement or live payment integration.

## Project context

The public edition is an independently extended, sanitized reconstruction of workflows originating in previously commissioned client work.

Built by [Emman at Hermit Edge](https://hermitedge.com).

## Copyright

Copyright © 2026 Emman Ermitaño. All rights reserved.