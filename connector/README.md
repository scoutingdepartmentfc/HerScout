# HerScout Local Data Connector (Phase 5)

Secure client connector that bridges local scouting datasets (`/Users/imac/Programas/Scouting_jugadores`) to **HerScout's Supabase PostgreSQL** instance over encrypted HTTPS.

---

## 1. Architectural Boundary (Local Mac vs Cloud HerScout)

```
+-------------------------------------------------------------+
| Local Mac Environment (Authorized Filesystem)               |
|                                                             |
|   /Users/imac/Programas/Scouting_jugadores/                 |
|   ├── pipeline/ (Existing Opta / Soccerdonna scripts)       |
|   └── docs/matchstats_femenino.csv (or exported datasets)   |
|                         │                                   |
|                         ▼                                   |
|   HerScout Local Connector (`connector/`)                   |
|   ├── Pydantic Schema Validation (models.py)                |
|   ├── Dry-run & Idempotent Upsert Engine (sync.py)          |
|   └── CLI & Ingestion Reporter (cli.py)                     |
+─────────────────────────┼───────────────────────────────────+
                          │
                          │ HTTPS REST API (Service Role Key)
                          ▼
+─────────────────────────────────────────────────────────────+
| Cloud / Supabase PostgreSQL Backend                         |
|                                                             |
|   public.players (988+ verified profiles)                   |
|   public.player_season_stats                                |
|   public.competitions / matches                             |
|                                                             |
|   ▲ Read Shared Data via Next.js SSR                        |
+───┼─────────────────────────────────────────────────────────+
| HerScout SaaS Web App (Vercel / Cloud)                      |
+-------------------------------------------------------------+
```

### Browser Limitations & Architectural Honesty
- **Standard Web Security Notice**: A web browser running in production cannot access arbitrary directories on a scout's local Mac (e.g. `/Users/imac/Programas/...`) without explicit file picker selection (`<input type="file">`) or drag-and-drop.
- **The Connector Solution**: The lightweight Python connector runs locally on the Mac (or in a scheduled GitHub Actions cron), reads only the authorized directory, validates the data, and sends the verified payload to Supabase via HTTPS REST endpoints.

---

## 2. Core Features Implemented

1. **Strict Directory Restriction & Credential Safety**:
   - Filesystem reads are restricted strictly to authorized directories.
   - Credentials (`SUPABASE_SERVICE_ROLE_KEY` and URL) are loaded via environment variables or protected `.env` files. Never exposed in frontend code.
2. **Schema & Data Type Validation**:
   - `PlayerRecord` validates required identifiers, non-empty names, tactical position codes, numbers, and dates.
3. **Duplicate Prevention & Idempotency**:
   - Uses `upsert(..., on_conflict="id")` ensuring repeat runs never create duplicate rows.
   - Differentiates between new insertions and updates to existing players.
4. **Dry-Run / Preview Mode**:
   - Allows previewing validations, row errors, and proposed changes without touching the database.
5. **Row-Level Error Reporting**:
   - Records line-by-line validation errors, error types, and offending rows without halting the whole batch.
6. **Safe Recovery & Provenance**:
   - Never deletes existing records absent from a file unless explicitly commanded.

---

## 3. How to Run the Connector

### Dry-Run / Preview (No database changes)
```bash
python3 -m connector.cli --file connector/fixtures/mixed_players.csv --dry-run
```

### Run Live Import with Sample Limit
```bash
python3 -m connector.cli --file connector/fixtures/valid_players.csv --max-records 10
```

### Run Complete Import Batch
```bash
python3 -m connector.cli --file /path/to/extracted_players.csv --batch-size 100
```

---

## 4. How to Run Automated Verification Tests

The test suite validates:
1. Strict schema validation (empty IDs or names rejected).
2. Dry-run execution and row-level error reporting.
3. Live sample upsert and repeat idempotency (0 duplicates created).

```bash
python3 -m unittest discover -s connector/tests -v
```

