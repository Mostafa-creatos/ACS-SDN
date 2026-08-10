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
