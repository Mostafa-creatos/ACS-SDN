# SDN ZTP & Compliance Demo

Welcome to the **Zero-Touch Provisioning (ZTP)** and **Configuration Compliance** module of the Enterprise SDN Controller.

This document walks you through the end-to-end (E2E) workflow for onboarding a new factory-reset switch and remediating any configuration drift.

## Overview of Components
- **Ingestion API**: `POST /api/v5/discovery/on-boarding-ingestion` receives signals from DHCP/TFTP ZTP hooks.
- **Ansible Base Provisioning**: `southbound-ansible/roles/base_provisioning` orchestrates Dell OS10 config injection (NTP, DNS, AAA, Management Isolation, Control Plane Security, Interface Defaults).
- **ZTP Workers**: Celery background tasks (`ztp_tasks.py`) execute the Ansible playbooks and take the initial baseline snapshot.
- **Compliance Manager**: A Celery beat task (`config_compliance_mgr` in `config_lifecycle.py`) runs every 15 minutes to compare the active running config against the golden baseline.
- **Frontend Console**: 
  - `ZTP Console`: Displays the raw queue of discovered devices and their provisioning status.
  - `Switches (Lifecycle Tab)`: Displays drift state, categorized drift reasons (e.g. "AAA Security"), and provides a 1-click Rollback button.

## Demo Scenario 1: Onboarding a New Switch

1. **Simulate ZTP Hook**: 
   A bare-metal Dell OS10 switch boots up and gets an IP via DHCP. The DHCP server's post-processing script hits our API:
   ```bash
   curl -X POST http://localhost:8000/api/v5/discovery/on-boarding-ingestion \
     -H "Content-Type: application/json" \
     -d '{
       "mac_address": "00:11:22:33:44:55",
       "serial_number": "DELL-SPINE-01",
       "os_version": "10.5.2.0",
       "vendor": "dell_os10",
       "management_ip": "172.20.20.10"
     }'
   ```
2. **View in ZTP Console**:
   Navigate to the **ZTP Console** in the left sidebar.
   You will see the switch in a `pending` state.
3. **Automated Provisioning**:
   The `apply_baseline_template` Celery task kicks in, executes Ansible via subprocess, and provisions the switch.
   The state transitions to `provisioned`, and the switch now appears in the **Switches** inventory as `CompliantActive`.

## Demo Scenario 2: Drift Detection & Rollback

1. **Simulate Out-of-Band Change**:
   A rogue admin logs directly into `DELL-LEAF-01` via SSH (bypassing the SDN controller) and disables the NTP server:
   ```bash
   no ntp server 192.168.100.1
   ```
2. **Trigger Compliance Manager**:
   Wait 15 minutes, or manually trigger the `config_compliance_mgr` task.
3. **View Drift Alert**:
   Navigate to the **Switches** page. `DELL-LEAF-01` is now marked as `ConfigurationDrifted`.
   Click on the switch and open the **Lifecycle** tab. The UI explicitly flags a **Drifted Category: Observability**.
4. **1-Click Rollback**:
   Click the **Initiate Compliance Rollback** button.
   The `trigger_rollback` Celery task executes, re-runs the Ansible base provisioning playbook to enforce the golden baseline, and restores the switch to `CompliantActive`.

## Blast Radius & Approvals

If a drift is detected on a **Spine** switch, clicking rollback will **not** execute immediately. Instead, it places an approval request in the **Pending Approvals** queue, requiring a Platform Admin to explicitly authorize the change, thereby protecting the core network from unintended outages.
