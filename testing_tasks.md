# API Endpoint Testing Tracker

## Orchestrator
- [ ] POST /api/v5/orchestrator/policy-enforcement
- [ ] POST /api/v5/orchestrator/policy-reconciliation
- [ ] GET /api/v5/orchestrator/approvals
- [ ] POST /api/v5/orchestrator/approvals/{approval_id}/approve
- [ ] POST /api/v5/orchestrator/approvals/{approval_id}/reject
- [ ] POST /api/v5/orchestrator/async-config-push
## Admin
- [ ] POST /api/v5/admin/tenants
- [ ] GET /api/v5/admin/stats
- [ ] GET /api/v5/admin/tenants
- [ ] GET /api/v5/admin/switches
- [ ] GET /api/v5/admin/ztp-pool
- [ ] GET /api/v5/admin/subnets
- [ ] GET /api/v5/admin/topology
- [ ] POST /api/v5/admin/sync-netdisco
- [ ] POST /api/v5/admin/sync-gnmi
- [ ] POST /api/v5/admin/trigger-discover
- [ ] GET /api/v5/admin/switches/{switch_id}
- [ ] GET /api/v5/admin/switches/{switch_id}/hardware
- [ ] GET /api/v5/admin/switches/{switch_id}/vlans
- [ ] GET /api/v5/admin/switches/{switch_id}/lags
- [ ] GET /api/v5/admin/switches/{switch_id}/vlt
- [ ] POST /api/v5/admin/switches
- [ ] PUT /api/v5/admin/switches/{switch_id}
- [ ] DELETE /api/v5/admin/switches/{switch_id}
- [ ] POST /api/v5/admin/switches/{switch_id}/collect
- [ ] DELETE /api/v5/admin/tenants/{tenant_id}
## Other
- [ ] GET /
## Topology
- [x] GET /api/v5/topology/graph
## Visibility
- [x] POST /api/v5/visibility/snapshots
- [x] GET /api/v5/visibility/snapshots
- [x] POST /api/v5/visibility/rollback
- [x] POST /api/v5/visibility/accept-drift
- [x] POST /api/v5/visibility/compliance/run
- [x] GET /api/v5/visibility/compliance/latest
- [x] GET /api/v5/visibility/endpoints
- [x] GET /api/v5/visibility/telemetry
- [ ] GET /api/v5/visibility/inventory
- [ ] GET /api/v5/visibility/stp
- [ ] GET /api/v5/visibility/reports/csv
## Auth
- [x] POST /api/v5/auth/login
- [x] POST /api/v5/auth/switch-tenant
- [x] POST /api/v5/auth/change-password
- [x] POST /api/v5/auth/forgot-password
- [x] POST /api/v5/auth/reset-password
## Discovery
- [ ] POST /api/v5/discovery/on-boarding-ingestion
- [ ] GET /api/v5/discovery/pool
## Switches
- [ ] POST /api/v5/switches/{id}/rollback
## Users
- [ ] PATCH /api/v5/users/{user_id}
- [ ] DELETE /api/v5/users/{user_id}
- [ ] POST /api/v5/users/{user_id}/tenants
- [ ] DELETE /api/v5/users/{user_id}/tenants/{tenant_id}
