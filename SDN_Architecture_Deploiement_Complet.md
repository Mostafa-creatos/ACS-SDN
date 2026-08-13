# **ENTERPRISE SDN CONTROLLER**

## **Deployment Architecture & Consolidated Features**

Date: August 13, 2026  
Prepared by: Mostafa Faouzi  

---

# **Part 1 — Deployment Architecture (Rancher / Kubernetes)**

## **1.1 Overview**

The platform is deployed on a **Kubernetes (RKE2)** cluster orchestrated by **Rancher**, replacing the initial 5-dedicated-VM footprint. The core guiding principle is: **separating stateless from stateful workloads**, ensuring each class of load can scale and be restored independently.

```
Rancher Management Plane (UI, Cluster RBAC, Monitoring)
            │
            ▼
   Kubernetes Cluster (RKE2)
   ├── Ingress Layer (MetalLB + NGINX Ingress)
   ├── Node Pool "stateless"  → Deployments (Gateway, Celery, gNMI, Config Mgr)
   ├── Node Pool "stateful"   → StatefulSets (Postgres, Redis Sentinel)
   ├── Storage Layer          → Longhorn (CSI block storage)
   └── MinIO                  → backups, snapshots, exports (S3-compatible)
            │
            ▼
   Off-Cluster Dedicated VM : PNETLab (20 Dell OS10 switches, nested virtualization)
```

## **1.2 Rancher Management Plane**

**Role** — Rancher is not an application component; it acts as the management layer for the cluster itself.

* **Rancher UI/API —** Handles RKE2 cluster creation, lifecycle management, and centralized Kubernetes RBAC (distinct from the application's JWT-based RBAC — these two authorization planes must not be confused). It also provides an App Catalogue (Helm charts) to deploy Longhorn, MinIO, and monitoring configurations in a single click.

* **Integrated Monitoring (Prometheus + Grafana) —** Monitors **infrastructure health** (pod CPU/RAM usage, node availability, persistent volume claims status). This is **intentionally separated** from the SDN controller's business Telemetry DB, which tracks the status of network switches. These are two distinct concerns: infrastructure monitoring (ensuring the cluster runs correctly) versus network monitoring (ensuring the fabrics run correctly).

## **1.3 Ingress Layer**

Replaces the dedicated HAProxy/NGINX VM from the initial design.

* **MetalLB —** Provides an external Layer-2 Virtual IP (VIP) for the cluster (essential in on-premises environments lacking a native cloud load balancer).

* **NGINX Ingress Controller —** (Default on RKE2) Routes incoming HTTPS traffic to the `fastapi-gateway` Kubernetes service and handles TLS termination.

* **Ingress Benefits —** Eliminates manual configurations, enables native scaling, and provides declarative management via version-controlled YAML files.

## **1.4 Node Pool "stateless"**

Groups workloads that do not maintain persistent state, allowing them to be destroyed, rescheduled, or scaled dynamically.

| Deployment | Role | Scaling |
| :--- | :--- | :--- |
| `fastapi-gateway` | Central API Gateway (`main.py`) — administrative routing, policy, telemetry, config | HPA (Horizontal Pod Autoscaler) based on CPU/Request count |
| `celery-workers` | Asynchronous execution: southbound provisioning, Ansible/config lifecycle jobs, gNMI events parsing | **KEDA** ScaledObject — scales based on **Redis Streams queue depth**, matching the workload profile during compliance checks on 20+ switches |
| `gnmi-collector` | Persistent gNMI Subscribe sessions to the switches (LLDP, BGP, telemetry) | Fixed replicas or manual scaling — each pod manages a subset of switches |
| `config-compliance-mgr` | Snapshot archiving, golden-config audits, rollback execution, blast-radius calculation | Fixed replicas (low concurrent volume requirement) |

| **Why separate Gateway, Celery, gNMI, and Config Mgr into 4 distinct Deployments?** Each component has a different resource profile (synchronous API vs. asynchronous jobs vs. long-lived telemetry streams vs. periodic audits). Separating them ensures independent scaling without wasting cluster resources. |
| :---- |

## **1.5 Node Pool "stateful"**

Groups stateful workloads requiring persistent storage, isolated on cluster nodes equipped with fast local NVMe drives.

| StatefulSet | Role | High Availability Detail |
| :--- | :--- | :--- |
| `postgresql` | Shared application database (schema in section 2.5) | Managed via operator (CloudNativePG or Zalando postgres-operator) with 1 primary + 2 replicas, automated failover, and PITR (Point-In-Time Recovery) |
| `redis-sentinel` | Event bus (Redis Streams) + cache layer | 1 master + 1 replica + Sentinel monitors that automatically promote a new master in case of failure |

| **Why use a StatefulSet instead of a Deployment?** A StatefulSet guarantees stable network identities (predictable hostnames) and persistent volume mapping, which are essential for databases, unlike a Deployment where pods are treated as interchangeable. |
| :---- |

## **1.6 Storage — Longhorn and MinIO**

| System | Usage | Why This Choice |
| :--- | :--- | :--- |
| **Longhorn** | StorageClass for Postgres and Redis PVCs (block storage) | Built native to the Rancher/SUSE ecosystem, single-click install, replicates blocks across nodes, integrated snapshots. No external SAN hardware needed |
| **MinIO** | S3-compatible object storage for: Postgres backups (`pgBackRest`/`WAL-G`), archived config snapshots, exports (CSV/XLSX) | De facto standard for object storage, reusable for future needs (e.g., archiving historic configuration JSON payloads) |

| ⚠️ **NFS is intentionally avoided** for PostgreSQL/Redis: file-locking models and latency over NFS cause database corruption and reliability issues. NFS remains acceptable only for non-critical, cold file archiving if MinIO is not deployed. |
| :---- |

## **1.7 Velero — Saving the Cluster State**

Distinct from database backups: Velero backs up **Kubernetes manifests, PVCs, and secrets** to MinIO. Without this, a cluster disaster (accidental configuration wipe, operator error) would lose the deployment manifests and configuration. Velero restores the cluster state, not just business data.

## **1.8 PNETLab — Why It Remains Off-Cluster**

PNETLab requires **nested virtualization (VT-x/AMD-V)** to execute the 20 Dell OS10 virtual switches, making it unsuitable for standard, unprivileged Kubernetes pods.

* **Current Architecture —** Executed on a dedicated off-cluster VM. The `gnmi-collector` and southbound drivers (`drivers/arista_eos.py`, `drivers/nokia_srlinux.py`, `drivers/dell_os10.py`) connect to it over the routed network.

* **Future Evolution —** Potential migration to **Harvester** (Rancher's VM management tool based on KubeVirt) to execute these VMs *within* the Kubernetes cluster, unifying VM and container orchestration under Rancher. This is deferred to reduce initial deployment complexity.

## **1.9 Deployment Flow — Summary**

```
Client/Switch → MetalLB VIP → NGINX Ingress → fastapi-gateway Service
                                                       │
                                           (JWT Auth, Routing)
                                                       │
                              ┌────────────────────────┼────────────────────────┐
                              ▼                        ▼                        ▼
                    celery-workers              gnmi-collector          config-compliance-mgr
                     (Redis Queue)            (PNETLab via Network)       (Snapshots → MinIO)
                              │                        │                        │
                              └────────────┬───────────┴────────────┬───────────┘
                                           ▼                        ▼
                                 PostgreSQL StatefulSet    Redis Sentinel StatefulSet
                                     (Longhorn PVC)              (Longhorn PVC)
```

## **1.10 Development Architecture & Migration Plan**

### **1.10.1 Why Use Our Current Development / Staging Architecture?**

For development, local testing, and staging validation, the platform utilizes a simplified architecture combining **Docker Compose** and **Containerlab** on a single virtual machine (GCP `sdn-host-vm`).

* **Simple & Rapid Deployment —** A single local PowerShell script (`sync_and_launch.ps1`) compiles the frontend, syncs code to the VM, and restarts all containers in seconds.

* **Local Testing & Fast Retest Loop —** Developers can test API endpoint modifications, policy validations, and ZTP onboarding behaviors immediately without waiting for CI/CD builds or Kubernetes pod scheduling.

* **Lightweight Network Emulation —** Containerlab runs Nokia SRLinux and Dell OS10 switch images (via QEMU) directly within the VM's Docker network, routing management traffic (SSH, SNMP, gNMI) locally without external hypervisor configurations.

* **Cost Efficiency —** Operates on a single medium-sized VM instead of requiring a multi-node Kubernetes cluster.

### **1.10.2 Migration Plan to Production (Kubernetes / Rancher)**

To migrate the staging environment to the RKE2 production cluster, follow these steps:

1. **Containerization and Image Registry** :
    * Build production Docker images for the API backend (`sdn-controller_app`), Celery workers (`sdn-controller_celery-worker`), and frontend.
    * Push these tagged images to a secure private container registry (e.g., Google Artifact Registry or GitHub Container Registry).
2. **Kubernetes Manifests & Helm Charts Deployment** :
    * Translate `docker-compose.yml` service declarations into Kubernetes resources (`Deployments`, `Services`, `ConfigMaps`, `Secrets`).
    * Setup `StatefulSets` for PostgreSQL (via operator) and Redis Sentinel to ensure stable data tiers.
    * Use Longhorn as the default `StorageClass` to handle dynamic Persistent Volume Claims (PVC).
3. **Data & State Migration** :
    * Export a SQL dump of the staging PostgreSQL database (`sdn_controller`) and restore it in the production PostgreSQL cluster.
    * Configure Velero to schedule automatic backups of cluster states and manifests to the MinIO S3 bucket.
4. **Ingress Routing & TLS Certificates** :
    * Configure MetalLB with the external VIP range.
    * Define NGINX `Ingress` resources to route external HTTPS traffic (port 443 for UI, port 8000 for API) to the target services.
5. **Switch Infrastructure Redirection** :
    * Migrate the emulation topology from Containerlab to the production PNETLab server (nested virtualization enabled).
    * Update the switch connection profiles (management IP addresses, gNMI credentials, SNMP ports) in the Celery worker and gNMI collector configurations to point to the new network.

---

# **Part 2 — SDN Features (Application Platform)**

## **2.1 The 4 Logical Planes of the SDN Controller**

| Plane | Role | Components (Mapped to K8s Deployments) |
| :--- | :--- | :--- |
| **1. Consumption Plane** | API entry point, authentication | `fastapi-gateway` (`main.py`) + JWT/RBAC |
| **2. Policy & Management Plane** | Network intent validation, orchestration | 4-Stage Pipeline (`main.py`) + `celery-workers` |
| **3. Telemetry & Visibility Plane** | Real-time discovery, telemetry, config lifecycle | `gnmi-collector` + `config-compliance-mgr` |
| **4. Southbound Plane** | Device communication | Drivers: `arista_eos.py` / `nokia_srlinux.py` / `dell_os10.py` |

## **2.2 Zero-Touch Provisioning (ZTP)**

Enables automated, out-of-the-box onboarding for unconfigured switches:

1. The switch boots and broadcasts a `DHCP Discover` request containing the ZTP option.
2. The DHCP server responds with an IP and Option 67 (pointing to the boot script URL).
3. The switch executes the boot script, which sends a POST request containing its MAC, Serial, OS, and Vendor to `/api/v5/discovery/on-boarding-ingestion` — **no auth header required** since validation is handled at the network level.
4. The controller inserts or updates a record in the `ztp_discovery_pool` table and returns a `202 Accepted` response.

## **2.3 Multi-Tenant Policy Engine — 4-Stage Pipeline**

Endpoint: `POST /api/v5/orchestrator/policy-enforcement`. Prevents configuration overlaps (VLAN, VRF, or Subnet) between tenants.

| Stage | Check | Failure Action |
| :--- | :--- | :--- |
| 1. Syntax Validation | Valid IP formats (`ipaddress.ip_network`), gateway extraction | `400 Bad Request` |
| 2. Tenant Boundary Isolation | Ensures subnets do not overlap with subnets of other tenants (`ipam_subnets`, `tenant_vrfs`) | `400 Bad Request` |
| 3. Topology & VLAN Collision | Target switches exist; VLAN IDs do not overlap with other active VRFs on the fabric | `400 Bad Request` |
| 4. Dry-Run Diff Engine | Renders configuration payloads via southbound driver | If `dry_run=true` → returns diff only. Otherwise → commits and dispatches Celery task |

## **2.4 Topological Discovery & Real-Time Telemetry (gNMI)**

Replaces legacy SNMP and CLI polling with **streaming push telemetry**:

* **LLDP Topology Discovery —** Connects via gNMI Subscribe on `/system/lldp` (using `pygnmi`) to update the `topology_edges` and `topology_nodes` dynamically.
* **Endpoint Tracking —** Extracts MAC and ARP tables from leaf switches to update `discovered_endpoints`.
* **Telemetry Gathering —** Streams interface octets in/out, CPU utilization, and chassis temperature.
* **Sandbox Limitations —** Nokia SRLinux, Arista EOS, and Dell OS10 are natively supported in production. In the Containerlab staging environment, Dell telemetry metrics are simulated due to VM virtual image constraints.

## **2.5 Config Lifecycle & Compliance**

Switch lifecycle state machine: `DiscoveredRaw` → initial snapshot → `CompliantActive` → periodic audits → `PassRules`/`FailRules`. If an out-of-band manual configuration drift is detected → `ConfigurationDrifted` → `TriggerRollback`.

**Current Audit Rules**:
* NTP configured (default `192.168.100.1`)
* DNS configured (default `8.8.8.8`)
* AAA (local authentication) enabled — marked as a critical rule

**Blast-Radius Protection**:
* Rollback on a Leaf → impact = 1 device
* Rollback on a Spine → impact = entire fabric path (blast radius = 6)
* If blast radius > 2 → **Four-Eyes Approval required** (restricted to Platform Admin role)

## **2.6 Data Model (PostgreSQL)**

| Table | Role |
| :--- | :--- |
| `users`, `tenants`, `tenant_vrfs` | Identity and multi-tenant isolation |
| `fabrics`, `fabric_blueprints` | Fabric topology definitions and base templates |
| `ipam_subnets`, `ipam_ip_allocations` | VRF-aware IP address management |
| `ztp_discovery_pool`, `switches` | Device onboarding queue and active inventory |
| `topology_nodes`, `topology_edges` | Topological graph data (LLDP/BGP) |
| `discovered_endpoints` | Dynamically learned MAC/IP endpoints |
| `telemetry_metrics`, `telemetry_metadata` | Historical operational metrics |
| `config_snapshots` | Configuration history archive (append-only) |
| `compliance_runs`, `compliance_findings` | Compliance audit logs |

## **2.7 Northbound API Reference (Summary)**

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v5/auth/login` | POST | Authenticates user credentials → returns JWT |
| `/api/v5/orchestrator/policy-enforcement` | POST | Submits network configuration intent (supports dry-run) |
| `/api/v5/orchestrator/policy-reconciliation` | POST | Reverts allocations + triggers rollback |
| `/api/v5/discovery/on-boarding-ingestion` | POST | Receives ZTP discovery signals (unauthenticated) |
| `/api/v5/visibility/snapshots` | POST/GET | Manages/retrieves configuration snapshots and history |
| `/api/v5/visibility/rollback` | POST | Triggers rollback with blast-radius check |
| `/api/v5/visibility/compliance/run` \| `/latest` | POST/GET | Executes/retrieves compliance audits |
| `/api/v5/visibility/endpoints` | GET | Lists discovered endpoints |
| `/api/v5/visibility/telemetry` | GET | Retrieves telemetry metric series |
| `/api/v5/admin/stats` \| `/topology` | GET | Retrieves stats and topology graph data |

## **2.8 Security & Application RBAC**

* **JWT Bearer token** required for every write operation.
* 3 roles: **Platform Admin** (full access), **Tenant Operator** (read-write scoped to tenant), **Tenant Auditor** (read-only scoped to tenant).
* Tenant boundary isolation is enforced at Stage 2 of the policy pipeline — not just at the API routing layer.

| ⚠️ **Do not confuse application RBAC** (JWT tokens, tenant scopes) with **Kubernetes RBAC** managed by Rancher (which controls who can manage the cluster pods and resources) — these are two completely separate planes. |
| :---- |

## **2.9 Functional Roadmap (Gaps vs. Target Scope)**

| Feature | Status | Estimated Effort |
| :--- | :--- | :--- |
| BGP Peering Graph | ⚠️ Not Implemented | Medium — add gNMI Subscribe on `/network-instances/.../bgp` |
| ISIS / MPLS LDP Topology | ❌ Not Implemented | High — implement only if enterprise routing requirements justify it |
| Compliance Scoring & Trends | ⚠️ Partial | Low — add aggregated scoring fields to `compliance_runs` |
| Reporting & Exports (CSV/XLSX) | ❌ Not Implemented | Low — implement dedicated endpoints using `pandas` and Celery Beat scheduler |
| Fine-grained RBAC (40+ permissions) | ⚠️ Partial (3 fixed roles) | Medium — transition the JWT claims to a permission-based matrix |
| Interactive Frontend UI | ⚠️ In Development | High — React SPA integrated with react-flow or cytoscape.js |

---

# **Part 3 — Consolidated Technical Stack (Deployment + Application)**

| Layer | Technology |
| :--- | :--- |
| Cluster Orchestration | Rancher + RKE2 (Kubernetes) |
| Ingress Layer | MetalLB + NGINX Ingress Controller |
| Autoscaling | HPA (Gateway), KEDA (Celery based on Redis Stream queue depth) |
| Database | PostgreSQL managed via operator (CloudNativePG / Zalando) |
| Event Bus / Cache | Redis Sentinel (StatefulSet) |
| Block Storage (CSI) | Longhorn |
| Object Storage (S3) | MinIO |
| Cluster Backup | Velero |
| Database Backup (PITR) | pgBackRest / WAL-G |
| Infrastructure Monitoring | Prometheus + Grafana (Rancher integrated stack) |
| API Gateway | FastAPI (`main.py`) |
| Policy Validation | Pydantic + custom 4-stage validation pipeline |
| Telemetry & Discovery | gNMI (`pygnmi`), `gnmi_discovery.py`, `metrics_collector.py` |
| Config Lifecycle | `config_lifecycle.py` |
| Job Orchestration | Celery + Redis Streams |
| Southbound Drivers | `drivers/nokia_srlinux.py`, `drivers/dell_os10.py`, `drivers/arista_eos.py` |
| Application Authentication | JWT Bearer (3 roles) |
| Network Testing Sandbox | PNETLab (20× Dell OS10, dedicated VM, nested virtualization) |

---

# **Part 4 — Next Steps**

1. Deploy the RKE2 cluster via Rancher and install Longhorn and MinIO from the App Catalogue.
2. Select and deploy the PostgreSQL operator (CloudNativePG is recommended for simplicity).
3. Containerize the application modules (`main.py`, `gnmi_discovery.py`, `config_lifecycle.py`) as separate Docker images per deployment.
4. Configure KEDA to dynamically scale the Celery workers based on Redis queue depth.
5. Setup Velero and pgBackRest database PITR backups to MinIO before any production rollout.
6. Retain PNETLab as a separate VM; evaluate Harvester integration at a later stage.
7. Address functional gaps: prioritize compliance scoring/trends and CSV reporting first (low effort, high value), followed by the BGP peering graph.
