# Phase 0 — Baseline Record (2026-08-10)

Refactor base: **commit `144cdeb7`**, working tree clean (earlier uncommitted work landed as
`0b0a2748`, `0959e15e`, `144cdeb7`).

## Green gates (re-run after every phase; must stay identical)

| Gate | Baseline | Artifact |
|---|---|---|
| OpenAPI | **98 operationIds**, 98 routes, duplicate operationId `create_tenant_api_v5_admin_tenants_post` (proof of tenants dup) | `openapi.json`, `route_list.txt` |
| Backend compile | **45/45 files** pass `ast.parse(feature_version=(3,11))` + `py_compile` | — |
| Backend import | `import app.main; import app.workers.celery_app; from app import models, schemas` → **OK** | — |
| Frontend `tsc -b` | **exit 0** | — |
| Frontend `npm run build` | **exit 0** (dist built in ~52s) | — |
| Frontend `npm run lint` | **125 errors / 16 warnings** (PRE-EXISTING; not clean) → gate = **zero NEW lint issues** | — |

## Known-broken baselines (must be repaired in Phase A before structural split)

- **Backend pytest (local)**: `5 failed, 1 passed, 3 errors`. Root causes:
  - No `conftest.py` — `db_session` fixture is undefined (`test_drift_rollback.py` uses it).
  - Tests hit the live app DB (`sdn_dev.db` SQLite fallback, stale → `no such table: tenants`).
- **unittest in container**: `Ran 0 tests` — suite is pytest-style; **pytest is not installed** in the image.
- **3 test files target a dead VM** (`mostafafaouzi89@34.90.176.247` refused; `connection refused`):
  `test_device_inventory.py`, `test_endpoints.py`, `test_sentinel_failover.py`.
- **`db_session`/pytest fixtures**: tests assume in-container Postgres; not self-contained.

## Instrumentation baselines

- `print()` in `backend/app`: **119 across 22 files** (exact per-file counts in `print_inventory.txt`).
  Top offenders: `workers/ztp_tasks.py` 26, `scripts/seed_database.py` 12, `scratch/test_dell_console.py` 12,
  `main.py` 10, `workers/sync_tasks.py` 9.
  Security: `routers/users.py:113` prints a temp password.
- `console.*` in `frontend/src`: **26** (25× `console.error`, 1× `console.log` at `Topology.tsx:588`).
- Celery registry (deployed worker): 7 tasks —
  `app.workers.config_lifecycle.{apply_remediation,config_compliance_mgr}`,
  `app.workers.sync_tasks.{auto_provision_subnet_task,backup_switch_config_task,sync_switch_config_task}`,
  `app.workers.ztp_tasks.{apply_baseline_template,trigger_rollback}`.
  Task names are an invariant (do not rename worker modules).
- Working tree at baseline is clean (`git status` shows only `_archive/` and `dell_baseline_commands.cfg` untracked).

## Phase A — Structural refactor record (2026-08-10)

### What changed (zero functional change to API behavior)

1. **Test infra repair** — new `backend/tests/conftest.py` (dedicated `test_sdn_refactor.db`,
   session-scoped `create_all` + `migrate_db_columns`, `get_db` override, per-test DB truncation,
   `db_session`/`client` fixtures, `e2e` marker, no-op Celery dispatch fixture). Real bug fixed in
   `routers/tenants.py` (`user_id` UUID coercion for `UserTenantMembership`). Stale tests re-aligned
   to real routes (`policy-enforcement`, rollback auth, ztp ingestion). 3 SSH-delegating tests
   re-pointed to `alkhairplateforme@34.32.194.240`. `pytest==8.3.3` added to `requirements.txt`.
2. **Logging** — new `core/logging_config.py` (`get_logger`, namespaced under `sdn.controller`,
   INFO default, stdout handler). 61 runtime `print()` → `logger.*` across 10 files; `routers/users.py`
   no longer logs temp passwords. All other 58 `print()` remain only in `_archive/`d files and the
   SEED_ON_STARTUP script.
3. **Constants** — `core/constants.py` (`LIFECYCLE_COMPLIANT/DRIFTED/DISCOVERED`); `main.py`
   re-exports so existing imports keep working.
4. **Circular imports** — `drivers/factory.py` owns `resolve_southbound_driver`; workers now import
   from it (was `..main`); `main.py` keeps a re-export shim.
5. **Tenants de-dup** — removed the dead duplicate POST/GET `/api/v5/admin/tenants` from `main.py`
   (the `routers/tenants.py` versions were already runtime-effective as first-registered).
6. **Packaging** — `__init__.py` added for `app`, `drivers`, `orchestrator`, `telemetry`, `workers`.
7. **Dead code → `_archive/`** — root `check.py`, `fix.py`, `test_dell.py`; `app/fix.py`,
   `app/patch_main.py`, `app/admin_ui.py`; `app/scratch/*`; `app/scripts/{seed_database,
   cleanup_duplicates,trigger_ztp_simulation,read_app_log,read_remote_main,ztp_bootstrap}.py`.
   `scripts/clean_and_seed_new_fabrics.py` KEPT (referenced by `main.py` under `SEED_ON_STARTUP`).
8. **`.gitignore`** (repo root) — `*.db`, caches, venvs, logs.

### Flagged behavior-visible deltas (deliberate; reviewed)

| Delta | Before | After | Why |
|---|---|---|---|
| OpenAPI `POST /api/v5/admin/tenants` | `201` (dead route's contract) | `200` | Spec now matches ACTUAL runtime (router was already first-registered and returned 200). Runtime unchanged. |
| OpenAPI `GET /api/v5/admin/tenants` operationId | `get_admin_tenants_...` | `list_tenants_...` | Same — spec now shows the effective router handler. |
| `GET /` fallback (no `frontend/dist`) | 2,046-line admin HTML (hardcoded mock tokens) | minimal placeholder redirecting to `/docs` | `admin_ui.py` archived; React build path unchanged. |
| `routers/users.py` | temp password printed | not logged | security fix (flagged intentionally). |

### Phase A gate results (all green)

| Gate | Result |
|---|---|
| pytest local | **53 passed, 2 deselected, 0 failed** (`SDN_TEST_LOCAL=1`, `-m "not e2e"`) |
| OpenAPI | **98 operationIds**; diff vs `openapi_after_test_repair.json` = exactly the 2 tenant deltas above; new artifact `openapi_after_phase_a.json` |
| Backend compile | **42/42 files** `ast.parse(feature_version=(3,11))`, 0 errors |
| Backend import | `app.main` + `app.workers.celery_app` OK |
| Frontend `tsc -b && vite build` | exit 0 (~45s) |
| Frontend `npm run lint` | **125 errors / 16 warnings** — identical to baseline, zero new |
| `print()` in live `backend/app` | **0** (61 converted; remaining only in archived/dev-gated files) |

## Phase B — API client + types consolidation (2026-08-11)

### What changed (zero functional change to UI behavior)

1. **API client consolidation** — every raw `fetch('/api/...')` call in `frontend/src` was converted to
   the consolidated client in `frontend/src/lib/api.ts` (~710 lines). Raw `fetch(` now exists ONLY inside
   `lib/api.ts`. Pages, components, and `AuthContext` delegate: 18 pages (`AuditLogsPage, BackupRestorePage,
   ChangePasswordPage, Compliance, ConfigPushPage, Dashboard, IPAM, Login, PendingApprovals, ProvisioningStatus,
   ReportsPage, STPPage, Switches, TenantsPage, Topology, UsersPage, ZtpConsolePage, TenantFabricMapping`) +
   3 components (`AppShell, AddSwitchModal, DeleteConfirmModal`).
2. **Types consolidation** — `frontend/src/lib/types.ts` deleted; types consolidated under `frontend/src/types/`
   (`index.ts` re-export barrel, `user-types.ts`; `switch-types.ts`, `config-push-types.ts` kept). All imports
   re-pointed (incl. `verbatimModuleSyntax`-compliant `import type`).
3. **Dead/dev code → `_archive/frontend/src/...`** — `pages/Styleguide.tsx`, `pages/__tests__/ZtpConsole.test.tsx`,
   `components/config-push/InterfaceFetcher.ts`, `assets/react.svg`.

### Flagged behavior-visible deltas (deliberate; reviewed)

| Delta | Before | After | Why |
|---|---|---|---|
| `/styleguide` route | existed (dev-only page, not in nav) | removed | Styleguide.tsx archived as dev/dead code. |
| Auth header source | per-page `token` from `useAuth()` context | `localStorage['atlas_jwt']` inside client | Same value (context mirrors localStorage); identical header on every call. |
| `Content-Type` on GETs | absent | `application/json` | Harmless (no body); unified client behavior. |
| Error-message fallbacks | `await res.text()` per call site | identical text preserved (`errorText` from client; empty→empty) | Matches original exactly. |
| `react.svg`, `InterfaceFetcher.ts` | unused assets/code | removed/archived | No runtime impact. |

No API routes, contracts, or endpoints touched (frontend-only phase). Backend untouched.

### Phase B gate results (all green)

| Gate | Result |
|---|---|
| Frontend `npm run lint` | **121 errors / 14 warnings** = **zero NEW** (delta vs 125/16: api.ts −1 err; BackupRestorePage −1 err −1 warn; Dashboard −1 err; PendingApprovals −1 warn; 4 archived files dropped from scope). No file above baseline. |
| Frontend `tsc -b && vite build` | exit 0 (~50s; only pre-existing chunk-size + dynamic-import `lib/api.ts` warning) |
| `console.*` in `frontend/src` | **26** (25× `console.error`, 1× `console.log` at `Topology.tsx:570`) — identical |
| pytest local | **53 passed, 2 deselected, 0 failed** |
| Backend compile + import | `ast.parse(feature_version=(3,11))` + `import app.main, app.workers.celery_app` → OK (only pre-existing FastAPIDeprecationWarning) |
| OpenAPI | unchanged (frontend-only phase) |
| Lint diff tooling | `Temp\opencode\{lint_diff.py,lint_baseline.json,lint_current.json}` (TEMP, outside repo) |

## Phase C — main.py split into domain routers + core helpers (2026-08-12)

### What changed (zero functional change; backend-only)

`app/main.py` slimmed **2,117 → 65 lines**. Route handlers moved **verbatim**
(function names invariant → identical OpenAPI operationIds) into new routers;
startup/migration logic moved into `core/`:

| New module | Contents |
|---|---|
| `core/db_migrations.py` | `migrate_db_columns` (verbatim; re-exported by `app.main` for tests) |
| `core/startup.py` | `initialize_database` (create_all + migrate + seed + legacy user-tenant sync), `start_background_loops` |
| `routers/orchestrator.py` | policy-enforcement, policy-reconciliation, approvals count/list/approve/reject, async-config-push |
| `routers/admin.py` | audit-logs, stats, celery-stats, admin/switches, ztp-pool, subnets, ipam/search, admin/topology, topology/graph, sync-netdisco+sync-gnmi, trigger-discover |
| `routers/visibility.py` | snapshots (list/create), rollback, accept-drift, compliance run/latest/remediate/runs/rules/history, endpoints, telemetry, stp, reports/csv |
| `routers/switch_config.py` | `calculate_blast_radius` helper, switch-config/push, switch-config/history |

Notes:
- `@app.*` decorators → `@router.*` (`router = APIRouter()`), same paths/status codes.
- Internal relative imports converted to absolute (`from app.workers...`, `from app.auth...`, etc.) so they
  resolve from the new modules; lazy in-function imports preserved (import-cycle safe).
- Router include order in `main.py` preserves the original registration order
  (7 existing routers → `/api/v5/` root → 4 new routers → `GET /` fallback → `/assets` static mount).
- `app.main` re-exports preserved: `app`, `get_db`, `migrate_db_columns`, `resolve_southbound_driver`,
  `LIFECYCLE_{COMPLIANT,DRIFTED,DISCOVERED}`.
- No flagged behavior deltas — this is a pure move; route table content and resolution identical
  (verified by the OpenAPI diff: same (method, path) → operationId mapping).

### Phase C gate results (all green)

| Gate | Result |
|---|---|
| pytest local | **53 passed, 2 deselected, 0 failed** |
| OpenAPI | **98 operationIds / 83 paths**; diff vs `openapi_after_phase_a.json` = **0** (opids, methods, paths, response status codes). New artifact `openapi_after_phase_c.json` in `Temp\opencode\`. |
| Backend compile + import | `ast.parse(feature_version=(3,11))` 48 files + `import app.main, app.workers.celery_app` → OK |
| Frontend `tsc -b && vite build` | exit 0 (unchanged; frontend untouched) |
| Frontend `npm run lint` | **121 errors / 14 warnings** — unchanged (frontend untouched) |
| `print()` in live `backend/app` | **0** |
