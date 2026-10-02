<div align="center">

# ⚡ ATLAS CLOUD SERVICES — SDN ORCHESTRATOR (ACS-SDN)

### *An Enterprise Software-Defined Networking Controller & Compliance Framework for Dell OS10 Fabrics*

**Engineering Internship Project @ Atlas Cloud Services (ACS)**  
**Author:** Mostafa Faouzi  

[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Dell OS10](https://img.shields.io/badge/Dell_OS10-0076CE?style=for-the-badge&logo=dell&logoColor=white)](https://www.dell.com/)
[![PNetLab](https://img.shields.io/badge/PNetLab-Network_Emulation-orange?style=for-the-badge)](https://pnetlab.com/)
[![Ansible](https://img.shields.io/badge/Ansible-EE0000?style=for-the-badge&logo=ansible&logoColor=white)](https://www.ansible.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL_15-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis_Sentinel-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)

---

</div>

## 📌 Project Overview

**ACS-SDN** is an end-to-end, cloud-native **Software-Defined Networking (SDN) Controller and Orchestration Engine** engineered during an end-of-studies software engineering internship at **Atlas Cloud Services (ACS)**.

The platform automates the provisioning, multi-tenant policy enforcement, real-time topological discovery, and continuous configuration compliance for enterprise data center fabrics running **Dell OS10 switches**.

### 🎯 Core Objectives
- **Zero-Touch Provisioning (ZTP)**: Eliminate manual console access by automating factory-reset switch onboarding via DHCP Option 67 and Ansible.
- **Multi-Tenant Boundary Isolation**: Enforce a strict 4-stage intent validation pipeline to prevent IP, VRF, and VLAN collisions.
- **Continuous Compliance & Self-Healing**: Audit running configurations every 15 minutes against golden security baselines with automated 1-click rollbacks.
- **Blast-Radius Protection**: Guard core network paths by requiring **Four-Eyes Platform Admin Approval** for high-impact Spine switch rollbacks.

---

## ⚡ Key Engineering Achievements & Empirical Results

The platform was deployed and benchmarked on a live staging environment operating a **20-switch Dell OS10 Spine-Leaf fabric**:

- ⚡ **ZTP Onboarding Latency**: `< 2 minutes` (from bare-metal DHCP discovery to `CompliantActive` status).
- 🔍 **Automated Compliance Sweeps**: `68+ audit runs` executed with `2,859 rule findings` logged and categorized across the fabric.
- 🌐 **Dynamic LLDP Topology**: `27 active inter-switch link edges` dynamically discovered and rendered in real time.
- 🛡️ **Blast-Radius Safety**: 100% of high blast-radius Spine switch rollbacks intercepted by the Four-Eyes Approval queue.
- 🏢 **Multi-Tenant Isolation**: 100% enforcement of VRF-aware IPAM subnets and fabric VLAN bounds.
- ⚡ **High-Performance Messaging**: Asynchronous worker execution driven by Celery and backstopped by a High-Availability Redis Sentinel cluster.

---

## 🧪 Emulation & Testing Sandbox

To simulate a real enterprise data center environment, the controller connects to a dedicated **PNetLab** virtualized infrastructure running:
- **Topology**: Spine-Leaf CLOS Fabric
- **Scale**: 20× Virtual **Dell OS10 S5248F-ON** Switches (running via QEMU nested virtualization)
- **Control Plane**: Out-of-band management network connected to DHCP, ZTP Ingestion API, and interactive SSH/Telnet collectors.

---

## 🏗️ System Architecture (The 4 Logical Planes)

ACS-SDN decouples network orchestration into four clean logical layers:

```
┌─────────────────────────────────────────────────────────────┐
│                 1. CONSUMPTION PLANE                        │
│   FastAPI Gateway | JWT Multi-Tenant RBAC | React SPA UI    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              2. POLICY & MANAGEMENT PLANE                   │
│   4-Stage Validation Pipeline | IPAM | Tenant VRF Isolation │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│            3. TELEMETRY & VISIBILITY PLANE                  │
│   Dell OS10 CLI Collector | Compliance Auditor | Drift Mgmt │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  4. SOUTHBOUND PLANE                        │
│   Dell OS10 Driver | Southbound Ansible Playbooks | SSH     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             PNETLAB EMULATED NETWORK INFRASTRUCTURE         │
│   Dedicated VM with 20+ Dell OS10 S5248F-ON Switches (QEMU)  │
└──────────────────────────────┴──────────────────────────────┘
```

### 🛡️ Multi-Tenant Policy Engine (4-Stage Pipeline)
Every intent payload sent to `/api/v5/orchestrator/policy-enforcement` is evaluated against 4 validation gates:
1. **Stage 1 (Syntax Check)**: Validates IP CIDR formats and gateways.
2. **Stage 2 (Tenant Boundary Check)**: Enforces IPAM subnets and VRF isolation across tenant boundaries.
3. **Stage 3 (Topology & VLAN Check)**: Prevents VLAN ID collisions across active switch fabrics.
4. **Stage 4 (Dry-Run Diff Engine)**: Generates CLI configuration diffs for dry-run inspection before committing.

---

## 💻 Frontend Console Tour (Page-by-Page)

The frontend single-page application is built with **React 18**, **TypeScript**, and **Tailwind CSS**, organized into four logical operational sections:

### 1. OPERATIONS
- 📊 **Dashboard**: Real-time telemetry overview, fabric system health metrics, active switch counts, and compliance scores.
- 🌐 **Topology Engine**: Interactive Spine-Leaf topology visualizer rendering LLDP inter-switch links, neighbor relationships, and learned host endpoints dynamically.
- 📄 **Reports**: Exportable analytics, fabric health summaries, and compliance audit reports in CSV and PDF formats.

### 2. FABRIC MANAGEMENT
- 🖧 **Switches**: Comprehensive inventory management for Dell OS10 S5248F-ON switches, health state monitoring, management IPs, and a dedicated **Lifecycle Tab** for tracking configuration drift and triggering 1-click rollbacks.
- 🔗 **Spanning Tree (STP)**: Spanning Tree Protocol status, root bridge monitoring, port state inspection, and topology loop prevention.
- ⚡ **ZTP Console**: Real-time queue displaying newly discovered bare-metal switches, MAC addresses, serial numbers, assigned DHCP IPs, and automated baseline onboarding status (`pending` $\rightarrow$ `provisioned`).
- 💾 **Backup & Restore**: Snapshot management, baseline golden configuration archiving, and automated restoration point recovery.

### 3. POLICY ENGINE
- 🌐 **IP Management (IPAM)**: VRF-aware IP address management, subnet pool allocations, and tenant boundary enforcement.
- 🚀 **Config Push**: Intent-based configuration push inspector featuring dry-run CLI diff previews before dispatching updates.
- 🛡️ **Compliance**: Real-time audit console evaluating golden security rules (`RULE-SEC-AAA-001`, `RULE-SEC-SSH-001`, `RULE-OBS-NTP-001`, etc.), displaying rule severity breakdowns and drift remediation hints.

### 4. PLATFORM ADMIN
- 👥 **Users & Access**: User administration and JWT Role-Based Access Control (`Platform Admin`, `Tenant Operator`, `Tenant Auditor`).
- 🏢 **Tenant Management**: Multi-tenant environment configuration, tenant VRF bindings, and resource isolation limits.
- ⏳ **Pending Approvals** *(New)*: Four-eyes approval workflow protecting core network paths by requiring explicit Platform Admin authorization for high blast-radius Spine switch rollbacks.
- 📜 **Audit Logs**: Immutable system-wide audit logging for all administrative operations, policy commits, and remediation executions.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend UI** | React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons |
| **API Gateway** | FastAPI (Python 3.11), Uvicorn, Pydantic v2, JWT Authentication |
| **Background Jobs & Worker** | Celery, Redis Streams, Flower (Task Monitor) |
| **Database Tier** | PostgreSQL 15 (SQLAlchemy ORM) |
| **Caching & Message Bus** | High-Availability Redis Sentinel Cluster (Master + 3 Sentinels + Replica) |
| **Southbound Driver & Automation** | Ansible Southbound Playbooks, SSH/Telnet CLI Collector (`DellOS10Collector`), Paramiko |
| **Emulation Sandbox** | PNetLab (20× Dell OS10 S5248F-ON virtual switches) |

---

## 📖 Deep-Dive Documentation

For a complete technical writeup on the architecture, compliance rules, and blast-radius rollback protection, see:
- 📄 [z_docs/MEDIUM_BLOG_POST.md](z_docs/MEDIUM_BLOG_POST.md) — *Detailed Technical Article & Engineering Breakdown*

---

<div align="center">
  <sub>Engineered with ❤️ for Atlas Cloud Services (ACS)</sub>
</div>
