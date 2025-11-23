# Real-time Data Aggregation Service

A backend service that aggregates token data from multiple APIs (DexScreener + Jupiter), normalizes and merges results, caches them in Redis, supports filtering/sorting/pagination, and broadcasts real-time updates via Socket.IO. Includes a dynamic poller that polls only user-interested queries.

**Project spec (uploaded by user):**
`/mnt/data/Backend Task 1_ Real-time Data Aggregation Service .pdf`

---

## Features
- Search & merge tokens from DexScreener + Jupiter (axios)
- Redis-backed caching (`ioredis`)
- Background poller with smoothing and configurable thresholds
- Socket.IO real-time updates (subscribe to rooms such as `discover:sol`)
- Filtering by time period: `1h`, `24h`, `7d`
- Sorting by `volume`, `liquidity`, `market_cap`, `price_change`
- Cursor-based pagination (`limit`, `cursor`)
- Admin endpoints (protected by `ADMIN_TOKEN`) to inspect watched queries and snapshots, delete snapshots, and request forced emits
- Unit tests for merge/normalize logic (assert-based, no external test runner)

---

## Quick start (local)

**Prerequisites**
- Node.js (v16+ recommended)
- npm
- Redis (local or cloud). If you prefer cloud, get a connection string from Upstash or similar.

**1. Clone / prepare**
```bash
# if repo exists locally
cd realtime-aggregator
