# Simulation Limitations & Telemetry Bypass Details

This document lists the simulation limitations, missing configurations, and mock interfaces for the **Enterprise SDN Controller** Containerlab environment.

## 1. Proprietary Switch Images
- **Dell OS10 & Arista cEOS**: These images require private vendor accounts or licenses. Because these NOS images are proprietary, direct live gNMI endpoints for Dell OS10 nodes cannot run in standard open/unlicensed environments.
- **Workaround**: We employ southbound abstraction drivers and a mock telemetry generator (`app/telemetry/metrics_collector.py`) that populates the database metrics for simulated switches (`spine-01`, `spine-02`, and Arista nodes if unlicenced) so that the analytics/telemetry engines function seamlessly and return production-grade stats.

## 2. Spanning Tree Protocol (STP) in Container Mode
- **Nokia SR Linux & Arista cEOS**: Standard container images for some network operating systems do not support full hardware-level STP (Spanning Tree Protocol) discovery or RSTP/MST status querying when running inside default Docker namespaces without kernel bridge bindings.
- **Workaround**: We capture spanning tree states using our telemetry scanner by mapping active topology links, and dynamically render port role statuses (blocking/forwarding) on the operator UI using mock data fallback if direct SSH or gNMI STP path queries fail.

## 3. L2VPN and MPLS Adjacencies
- **Lab Scale**: Building a full L2VPN/MPLS control plane (e.g. running LDP, VPLS, or RSVP-TE) on containerized switches is computationally heavy and often disabled in basic VM setups.
- **Workaround**: L2VPN and MPLS adjacency data is currently marked as out of scope for live Containerlab verification and is represented statically in the SDN Controller inventory schemas.
