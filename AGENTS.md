# SDN Controller — Refactor Continuation Context

Persistent project knowledge for the multi-session refactor of this repo.
Last updated: 2026-08-10 (Phase A committed). Read this before starting any session.

## Repo & Environment

- Repo: `C:\Users\mosta\OneDrive\Desktop\Antigravity\SDN-Front-End` (git). Windows/PowerShell 5.1 shell.
- Layout: `backend/` FastAPI app (`backend/app/`), `frontend/` React (Vite + TS), `_archive/` (git-kept dead code + baselines).
- Local Python 3.12.6. Container Python is 3.11 → grammar gate must use `ast.parse(src, feature_version=(3, 11))`.
- Deploy VM: `alkhairplateforme@34.32.194.240`. Local `backend/` maps FLAT to `/home/alkhairplateforme/sdn-controller`. Rebuild = `docker-compose build app/celery-worker/flower` + recreate. **Old SSH-delegation VM `mostafafaouzi89@34.90.176.247` is DEAD (connection refused)** — do not use.
- Deploy strategy: **push to VM once at the very END of the whole refactor, not per phase.** All gates run locally. Final smoke test after push: login + ZTP retry.

## Project Goal

Structural refactor with **ZERO functional changes**: preserve all **98 API routes/contracts**, Celery task names, DB models, and runtime behavior. Deliverable = refactored codebase + non-regression gates (pytest, openapi diff, compile, tsc/build, lint zero-new).

## Locked Decisions

- One pass = backend + frontend.
- Dead/dev code → `_archive/` (git-kept, never deleted).
- Tenants de-dup keeps `routers/tenants.py` (runtime-effective, requires `global:manage`); the `main.py` duplicate POST/GET were dead (first-registered wins in FastAPI) and were removed.
- Frontend scope = **API client + types consolidation only**; no UI behavior changes.
- Behavior-visible items: keep 100% identical; if changed, they are **flagged** and recorded in `_archive/phase0_baseline/BASELINE.md`.
- Gate baseline artifacts live in `_archive/phase0_baseline/` (`openapi.json` pre-refactor 98 opids, `openapi_after_test_repair.json`, `openapi_after_phase_a.json`, `route_list.txt`, `print_inventory.txt`, `BASELINE.md`).

## Instrumentation Baselines (must stay identical)

- OpenAPI: **98 operationIds** (paths=83). Celery registry: 7 tasks —
  `app.workers.config_lifecycle.{apply_remediation,config_compliance_mgr}`,
  `app.workers.sync_tasks.{auto_provision_subnet_task,backup_switch_config_task,sync_switch_config_task}`,
  `app.workers.ztp_tasks.{apply_baseline_template,trigger_rollback}`. Task names invariant.
- `console.*` in `frontend/src`: **26** (25× `console.error`, 1× `console.log` at `Topology.tsx:588`).
- Frontend lint baseline: **125 errors / 16 warnings** (PRE-EXISTING, not clean) → gate = **zero NEW lint issues**.
- `print()` in live `backend/app`: **0** after Phase A (was 119/22 files; remaining prints only in `_archive/` files + `scripts/clean_and_seed_new_fabrics.py` which is SEED_ON_STARTUP-gated and kept).

## Verified API/Auth Facts

- `auth.py` mock tokens active when `ENVIRONMENT != production`:
  - `mock-token-admin` → role `"Platform Admin"`, tenant `00000000-0000-0000-0000-000000000000`, user_id `00000000-0000-0000-0000-000000000000`.
  - `mock-token-operator` → role `"Tenant Operator"`, tenant `11111111-1111-1111-1111-11111111111a`, user_id `11111111-...11b`. Auditors similar (`...11c`).
  - `mock-token-operator-<tenant_id>` / `mock-token-auditor-<tenant_id>` → user_id `"mock"`.
- `/api/v5/orchestrator/policy-enforcement` requires `policy:submit_live` (operator → 403).
- `/api/v5/switches/{id}/rollback` requires `global:manage`.
- `/api/v5/discovery/on-boarding-ingestion` has NO auth; holds fabric-unassigned switches in the pool (no Celery dispatch). `/api/v5/discovery/pool` requires `inventory:read`.
- `UserTenantMembership.user_id` is a **UUID column** — bind with `uuid.UUID(...)` (string bind 500s). Fixed in `routers/tenants.py`.
- FastAPI route matching is first-registered; `_IncludedRouter` objects wrap router routes in `app.routes` (their `path` attr is missing). `get_openapi` last-wins for duplicates → spec can diverge from runtime (this caused the tenants 201-vs-200 gap).

## Commands (exact, PowerShell)

```powershell
# pytest (local): must stay green, -m "not e2e"
$env:SDN_TEST_LOCAL="1"; python -m pytest backend/tests -m "not e2e" -p no:cacheprovider -q

# Backend compile + import gate
$env:PYTHONPATH="C:\Users\mosta\OneDrive\Desktop\Antigravity\SDN-Front-End\backend"
python -c "import ast,pathlib,sys; sys.path.insert(0,'backend'); [ast.parse(f.read_text(encoding='utf-8'),filename=str(f),feature_version=(3,11)) for f in pathlib.Path('backend/app').rglob('*.py')]; import app.main, app.workers.celery_app; print('OK')"

# OpenAPI gate (dump + diff operationId + response status codes)
# use python -c scripts with sys.path.insert(0,'backend'); write to _archive/phase0_baseline/*.json
# PowerShell `>` redirection mangles UTF-8 -> UTF-16; always write from inside python.

# Frontend gates (workdir frontend/)
npm run build   # = tsc -b && vite build
npm run lint    # 125 errors/16 warnings == baseline
```

## Phase A — COMPLETED (commit `3acd9948`)

1. **Test infra**: `backend/tests/conftest.py` (dedicated `test_sdn_refactor.db`, session `create_all`+`migrate_db_columns`, `get_db` override, per-test truncation, `db_session`/`client` fixtures, `e2e` marker, no-op Celery `delay`/`apply_async` via `_FakeAsyncResult`). Tenants UUID coercion fix. Stale tests re-aligned (`test_rbac.py`, `test_drift_rollback.py`, `test_ztp_ingestion.py`, `test_endpoints.py`, `test_device_inventory.py`, `test_sentinel_failover.py`). 3 SSH tests → new VM. `pytest==8.3.3` in requirements.
2. **Logging**: `core/logging_config.py` (`get_logger`, `sdn.controller` tree, INFO default, stdout). 61 runtime `print()` → logger (10 files). Temp password no longer logged (`routers/users.py`). 4 multi-arg logger calls fixed to `%s` lazy format (were `logger.error("msg:", e)` crash bugs).
3. **Constants**: `core/constants.py` `LIFECYCLE_{COMPLIANT,DRIFTED,DISCOVERED}`; `main.py` re-exports.
4. **Factory**: `drivers/factory.py` owns `resolve_southbound_driver`; workers import from it (was `..main`); `main.py` keeps re-export shim.
5. **Tenants de-dup**: removed dead `main.py` POST/GET dups.
6. **Packaging**: `__init__.py` for `app`, `drivers`, `orchestrator`, `telemetry`, `workers`.
7. **Archival** to `_archive/backend/...`: root `check.py` `fix.py` `test_dell.py`; `app/fix.py` `app/patch_main.py` `app/admin_ui.py`; `app/scratch/*`; `app/scripts/{seed_database,cleanup_duplicates,trigger_ztp_simulation,read_app_log,read_remote_main,ztp_bootstrap}.py`. `scripts/clean_and_seed_new_fabrics.py` KEPT (referenced by `main.py` `SEED_ON_STARTUP`).
8. **`.gitignore`** (root): `*.db`, caches, venvs, logs.

### Phase A flagged deltas (deliberate; in BASELINE.md)

| Delta | Before → After |
|---|---|
| OpenAPI POST `/api/v5/admin/tenants` | `201` → `200` (spec now matches TRUE runtime; runtime unchanged) |
| OpenAPI GET `/api/v5/admin/tenants` operationId | `get_admin_tenants_...` → `list_tenants_...` |
| `GET /` fallback (no `frontend/dist`) | 2046-line admin HTML → placeholder redirecting to `/docs` |
| `routers/users.py` | temp password printed → not logged (security) |

### Phase A gates (all green)

- pytest: **53 passed, 2 deselected, 0 failed**
- OpenAPI: 98 opids, diff vs test-repair = exactly the 2 tenant deltas
- compile: 42/42 files; imports OK
- tsc + vite build: exit 0
- lint: 125/16 identical
- prints in live app: 0

## Phase B — COMPLETED (frontend API client + types consolidation)

1. **API client consolidation**: all raw `fetch('/api/...')` in `frontend/src` now lives ONLY in `lib/api.ts`
   (all page/components/AuthContext delegate). Types consolidated under `frontend/src/types/`
   (`index.ts` barrel, `user-types.ts`; `lib/types.ts` deleted).
2. **Archival** to `_archive/frontend/src/...`: `pages/Styleguide.tsx`, `pages/__tests__/ZtpConsole.test.tsx`,
   `components/config-push/InterfaceFetcher.ts`, `assets/react.svg`.
3. **Flagged deltas** (in `_archive/phase0_baseline/BASELINE.md` Phase B): `/styleguide` route removed (archived
   dev page); auth header now from `localStorage.atlas_jwt` (same value as removed context `token`); error-text
   fallbacks preserved exactly (`errorText` mirrors `await res.text()`).
4. **Gates (all green)**: lint **121/14 = zero NEW** (vs 125/16 baseline); `npm run build` exit 0; `console.*` 26
   unchanged; pytest **53 passed, 2 deselected**; backend compile/import OK.

## Phase C — COMPLETED (main.py split into domain routers + core helpers)

Slimmed `backend/app/main.py` **2,117 → 65 lines** by moving route handlers (verbatim, function names invariant → identical OpenAPI operationIds) into four new routers and startup/migration logic into `core/`:

- **`backend/app/core/db_migrations.py`**: `migrate_db_columns` (verbatim, re-exported by `main.py` for tests).
- **`backend/app/core/startup.py`**: `initialize_database` (create_all + migrate + seed + legacy user-tenant sync), `start_background_loops`.
- **`backend/app/routers/orchestrator.py`**: policy-enforcement, policy-reconciliation, approvals (count/list/approve/reject), async-config-push.
- **`backend/app/routers/admin.py`**: audit-logs, stats, celery-stats, admin/switches, ztp-pool, subnets, ipam/search, admin/topology, topology/graph, sync-netdisco/sync-gnmi, trigger-discover.
- **`backend/app/routers/visibility.py`**: snapshots, rollback, accept-drift, compliance (run/latest/findings/remediate/runs/rules/history), endpoints, telemetry, stp, reports/csv.
- **`backend/app/routers/switch_config.py`**: `calculate_blast_radius` helper, switch-config/push, switch-config/history.

`@app.*` decorators converted to `@router.*`; internal relative imports made absolute; lazy in-function imports preserved. `app.main` re-exports preserved (`app`, `get_db`, `migrate_db_columns`, `resolve_southbound_driver`, `LIFECYCLE_*`). Router include order in `main.py` kept identical to original.

**Gates (all green)**: pytest **53 passed, 2 deselected, 0 failed**; OpenAPI **98 operationIds / 83 paths, 0 diffs** vs baseline; compile+import OK; `npm run build` exit 0; lint **121/14 = zero NEW**; `print()` in live `backend/app` = **0**.

## Phase D and Final (NEXT)

- **Phase D (backend organization)**: remaining structural split (e.g., `schemas.py` → `schemas/` package, `models.py` → `models/` package with SQLAlchemy relationships) — re-derive concrete items with the team, keep behavior identical, run ALL gates after each change.
- **Final**: deploy once to `alkhairplateforme@34.32.194.240` (docker-compose build app/celery-worker/flower + recreate), then smoke test (login + ZTP retry). Run openapi diff on the VM too.

## Working Tree Note

Untracked and intentionally NOT committed: `Logo.png`, `dell_baseline_commands.cfg` (pre-existing, user-owned). Do not stage them unless asked.
