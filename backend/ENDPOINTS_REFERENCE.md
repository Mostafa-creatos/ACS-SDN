# Endpoints Reference — SDN Controller & Netdisco

This file documents all available HTTP endpoints for both the **FastAPI SDN Controller** and the **Netdisco Network Discovery Web UI**.

---

## Base URLs

| Service                    | Base URL                                |
|----------------------------|-----------------------------------------|
| FastAPI SDN Controller     | `http://<VM_IP>:8000`                  |
| FastAPI Interactive Docs   | `http://<VM_IP>:8000/docs`             |
| FastAPI OpenAPI JSON       | `http://<VM_IP>:8000/openapi.json`     |
| Netdisco Web UI            | `http://<VM_IP>:5000`                  |

> Replace `<VM_IP>` with the GCP VM's current external IP (check GCP Console if it changed after a restart).

---

## 1. FastAPI SDN Controller Endpoints

### Authentication
All write endpoints require a `Bearer` token in the `Authorization` header.

**Mock tokens for development:**

| Token                                  | Role              | Scope                  |
|----------------------------------------|-------------------|------------------------|
| `mock-token-admin`                     | Platform Admin    | All tenants            |
| `mock-token-operator-<tenant_uuid>`    | Tenant Operator   | Single tenant only     |

```http
Authorization: Bearer mock-token-admin
```

---

### API Endpoints

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| `POST` | `/api/v5/orchestrator/policy-enforcement` | ✅ Yes | Submit a network policy intent — validates CIDR, checks VRF/VLAN conflicts, generates vendor-specific config diffs, and optionally commits to the database and dispatches to the southbound queue |
| `POST` | `/api/v5/discovery/on-boarding-ingestion` | ❌ No | Ingest a ZTP (Zero Touch Provisioning) discovery signal from a newly unboxed bare-metal switch. Records serial number, MAC, hardware model, vendor, and DHCP IP |
| `POST` | `/api/v5/orchestrator/policy-reconciliation` | ✅ Yes | Roll back a committed network policy — removes the subnet allocation from the database and generates rollback configurations for all affected switches |
| `GET`  | `/docs` | ❌ No | Interactive Swagger UI — browse and test all API endpoints directly in the browser |
| `GET`  | `/openapi.json` | ❌ No | Raw OpenAPI 3.0 schema in JSON format — useful for importing into Postman or other API clients |

---

### Endpoint Details

#### `POST /api/v5/orchestrator/policy-enforcement`

Multi-stage pipeline: syntax validation → tenant boundary check → topology analysis → dry-run diff → optional commit.

**Request Body (`application/json`):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tenant_id` | `string (UUID)` | ✅ | Target tenant UUID |
| `vrf_name` | `string` | ✅ | Name of the VRF to provision into |
| `requested_cidr` | `string` | ✅ | Subnet to allocate (e.g. `10.10.10.0/24`) |
| `vlan_id` | `integer` | ✅ | VLAN ID for the L2 segment |
| `l2_vni` | `integer` | ✅ | VXLAN L2 VNI number |
| `l3_vni` | `integer` | ✅ | VXLAN L3 VNI number for the VRF |
| `target_switch_serials` | `array[string]` | ✅ | List of switch UUIDs or hostnames to target |
| `dry_run` | `boolean` | ✅ | If `true`, returns the diff matrix without committing |

**Responses:**

| Code | Meaning |
|------|---------|
| `202` | Accepted — policy processed (dry-run or committed) |
| `400` | Bad Request — CIDR overlap or VLAN conflict |
| `401` | Unauthorized — invalid or missing JWT token |
| `403` | Forbidden — tenant scope violation |
| `404` | Not Found — switch not found in inventory |
| `500` | Driver Error — config generation failed |

---

#### `POST /api/v5/discovery/on-boarding-ingestion`

Receives ZTP beacons from switches booting for the first time. No auth required — called by the switch bootstrap script.

**Request Body (`application/json`):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `serial_number` | `string` | ✅ | Hardware serial number |
| `mac_address` | `string` | ✅ | Management MAC address |
| `hardware_vendor` | `string` | ✅ | e.g. `dell`, `arista`, `nokia` |
| `hardware_model` | `string` | ✅ | e.g. `S5248F-ON` |
| `base_os_version` | `string` | ✅ | Firmware/OS version string |

**Responses:**

| Code | Meaning |
|------|---------|
| `202` | Accepted — discovery record created or updated |

---

#### `POST /api/v5/orchestrator/policy-reconciliation`

Removes a provisioned subnet and generates rollback configs for all switches in the fabric.

**Request Body (`application/json`):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tenant_id` | `string (UUID)` | ✅ | Target tenant UUID |
| `vrf_name` | `string` | ✅ | VRF containing the subnet |
| `subnet_cidr` | `string` | ✅ | Subnet CIDR to remove (e.g. `10.10.10.0/24`) |

**Responses:**

| Code | Meaning |
|------|---------|
| `200` | OK — subnet removed, rollback configs generated |
| `401` | Unauthorized |
| `403` | Forbidden — tenant scope violation |
| `404` | Not Found — VRF or subnet not found |

---

## 2. Netdisco Web UI Endpoints

Netdisco is accessed at `http://<VM_IP>:5000`. All endpoints below are browser-based (HTML pages).

### Authentication Pages

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/` | Home page — redirects to login if not authenticated |
| `GET`  | `/login` | Login form page |
| `POST` | `/login` | Submit login credentials |
| `GET`  | `/logout` | Log out the current session |

---

### Dashboard & Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/` | Main dashboard — shows network summary, recent activity, and alerts |
| `GET`  | `/search` | Global search bar — search by hostname, IP, MAC, or port description |

---

### Device Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/device` | List all discovered network devices |
| `GET`  | `/device?q=<ip_or_name>` | Filter devices by IP address or hostname |
| `GET`  | `/device/details?ip=<ip>` | Full device detail page — shows system info, interfaces, VLANs, neighbors |
| `GET`  | `/device/details?ip=<ip>&tab=ports` | Device ports tab — shows all interfaces and their status |
| `GET`  | `/device/details?ip=<ip>&tab=vlans` | Device VLANs tab — shows VLAN membership |
| `GET`  | `/device/details?ip=<ip>&tab=neighbors` | CDP/LLDP neighbors tab — shows topology adjacency |
| `GET`  | `/device/details?ip=<ip>&tab=modules` | Hardware modules tab (requires Entity MIB support) |
| `GET`  | `/device/details?ip=<ip>&tab=addresses` | IP addresses tab — shows all routed interfaces |

---

### Node / Host Tracking

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/node` | List all tracked end-nodes (hosts/servers) by MAC address |
| `GET`  | `/node?q=<mac_or_ip>` | Search nodes by MAC address or IP |

---

### Port / Interface Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/port` | List all switch ports across the network |
| `GET`  | `/port?q=<description>` | Search ports by description or alias |

---

### Network Topology

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/map` | Interactive network topology map — shows LLDP/CDP-discovered links between devices |

---

### VLAN Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/vlan` | List all VLANs discovered across the network |
| `GET`  | `/vlan?q=<vlan_id>` | Filter VLANs by ID |

---

### Administration

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/admin` | Admin control panel |
| `GET`  | `/admin/users` | Manage Netdisco user accounts |
| `GET`  | `/admin/device` | Add or manage devices manually |

---

### API (Netdisco REST API v1)

Netdisco also exposes a JSON REST API for programmatic access, accessible at `/api/v1/`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/v1/devices` | Returns a JSON list of all discovered devices |
| `GET`  | `/api/v1/device/<ip>` | Returns JSON details for a single device |
| `GET`  | `/api/v1/device/<ip>/ports` | Returns all ports/interfaces for a device |
| `GET`  | `/api/v1/device/<ip>/neighbors` | Returns LLDP/CDP neighbors for a device |
| `GET`  | `/api/v1/device/<ip>/vlans` | Returns VLAN membership for a device |
| `GET`  | `/api/v1/nodes` | Returns a JSON list of all tracked nodes/hosts |
| `GET`  | `/api/v1/node?q=<mac>` | Search for a node by MAC address |
| `GET`  | `/api/v1/topology` | Returns topology link data (JSON) |
| `GET`  | `/api/v1/report/device/inventory` | Full device inventory report in JSON |

> **Note:** Netdisco API calls require a valid session cookie (login via the web UI first) or an API key if configured in `netdisco.yml`.

---

### CLI Discovery Commands (Run from VM)

These are not HTTP endpoints but are the primary way to trigger discovery actions:

| Command | Description |
|---------|-------------|
| `netdisco-do discover -d <IP>` | Run full SNMP discovery on a specific device |
| `netdisco-do macsuck -d <IP>` | Collect MAC address table from a device |
| `netdisco-do arpnip -d <IP>` | Collect ARP table from a device |
| `netdisco-do nbtstat -d <IP>` | Collect NetBIOS node data |
| `netdisco-do expire` | Expire stale nodes and device records |

**Run from inside the backend container:**
```bash
docker exec clab-sdn-fabric-netdisco-backend netdisco-do discover -d 172.20.20.10
docker exec clab-sdn-fabric-netdisco-backend netdisco-do discover -d 172.20.20.11
docker exec clab-sdn-fabric-netdisco-backend netdisco-do discover -d 172.20.20.12
```
