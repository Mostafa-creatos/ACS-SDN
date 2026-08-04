# Enterprise SDN Controller — Architecture de Déploiement & Fonctionnalités
## Document de référence complet : Rancher/Kubernetes + Plateforme SDN

---

## Partie 1 — Architecture de déploiement (Rancher / Kubernetes)

### 1.1 Vue d'ensemble

La plateforme est déployée sur un cluster **Kubernetes (RKE2)** orchestré par **Rancher**, qui prend la place du modèle initial à 5 VM dédiées. Le principe directeur : **séparer le stateless du stateful**, pour que chaque type de charge puisse scaler et être restauré indépendamment.

```
Rancher Management Plane (UI, RBAC cluster, monitoring)
            │
            ▼
   Cluster Kubernetes (RKE2)
   ├── Ingress Layer (MetalLB + NGINX Ingress)
   ├── Node Pool "stateless"  → Deployments (Gateway, Celery, gNMI, Config Mgr)
   ├── Node Pool "stateful"   → StatefulSets (Postgres, Redis Sentinel)
   ├── Storage Layer          → Longhorn (CSI block storage)
   └── MinIO                  → backups, snapshots, exports (S3-compatible)
            │
            ▼
   VM dédiée hors cluster : PNETLab (20 switches Dell OS10, nested virtualization)
```

### 1.2 Rancher Management Plane

**Rôle** : Rancher n'est pas un composant applicatif — c'est la couche de gestion du cluster lui-même.

- **Rancher UI/API** : création et lifecycle du cluster RKE2, gestion centralisée du RBAC Kubernetes (différent du RBAC applicatif JWT du SDN controller — ne pas confondre les deux niveaux), catalogue d'apps (Helm charts) pour installer Longhorn, MinIO, monitoring en un clic.
- **Monitoring intégré (Prometheus + Grafana)** : surveille la **santé de l'infrastructure** (CPU/RAM des pods, disponibilité des nœuds, état des PVC) — **volontairement séparé** de la Telemetry DB métier du SDN controller, qui suit l'état des switches réseau. Ce sont deux préoccupations différentes : l'une surveille "est-ce que mon cluster tourne bien", l'autre "est-ce que mon réseau tourne bien".

### 1.3 Ingress Layer

Remplace la VM HAProxy/NGINX dédiée du design initial.

- **MetalLB** fournit une IP virtuelle (VIP) externe au cluster (nécessaire en on-prem, sans cloud load balancer natif).
- **NGINX Ingress Controller** (par défaut sur RKE2) route le trafic HTTPS entrant vers le service Kubernetes du `fastapi-gateway`, gère la terminaison TLS.
- Avantage par rapport à la VM dédiée : plus de mise à jour automatique, scaling natif si besoin, configuration déclarative en YAML versionné.

### 1.4 Node Pool "stateless"

Regroupe les workloads qui ne stockent aucun état persistant — on peut les détruire/recréer/déplacer librement.

| Deployment | Rôle | Scaling |
|---|---|---|
| `fastapi-gateway` | API Gateway central (`main.py`) — routing admin, policy, télémétrie, config | HPA (Horizontal Pod Autoscaler) sur CPU/nombre de requêtes |
| `celery-workers` | Exécution asynchrone : provisioning southbound, jobs Ansible/config lifecycle, traitement des events gNMI | **KEDA** ScaledObject — scale sur la **profondeur de la queue Redis Streams**, plus pertinent que le CPU pour ce type de charge (pics pendant les audits de compliance sur 20+ switches) |
| `gnmi-collector` | Sessions Subscribe gNMI persistantes vers les switches (LLDP, BGP, télémétrie) | Réplicas fixes ou scaling manuel — chaque pod peut gérer un sous-ensemble de switches |
| `config-compliance-mgr` | Snapshot, audit golden-config, déclenchement de rollback, blast-radius | Réplicas fixes (faible volume d'instances simultanées) |

**Pourquoi séparer Gateway/Celery/gNMI/Config Mgr en 4 Deployments distincts** plutôt qu'un seul gros service : chacun a un profil de charge différent (API synchrone vs jobs asynchrones vs connexions longue durée vs jobs périodiques), donc chacun doit pouvoir scaler indépendamment sans gaspiller de ressources sur les autres.

### 1.5 Node Pool "stateful"

Regroupe les workloads qui stockent un état persistant critique — isolés sur des nœuds avec stockage NVMe local rapide.

| StatefulSet | Rôle | Détail HA |
|---|---|---|
| `postgresql` | Base de données partagée (schéma section 2.5) | Géré par un opérateur (CloudNativePG ou Zalando postgres-operator) : 1 primary + 2 replicas, failover automatique, PITR (Point-In-Time Recovery) |
| `redis-sentinel` | Event bus (Redis Streams) + cache | 1 master + 1 replica + Sentinels qui surveillent et promeuvent automatiquement un nouveau master en cas de panne |

**Pourquoi un StatefulSet et pas un Deployment** : un StatefulSet garantit une identité réseau stable (hostname prévisible) et un attachement persistant à son propre volume — indispensable pour une base de données, contrairement à un Deployment où les pods sont interchangeables.

### 1.6 Stockage — Longhorn et MinIO

| Système | Usage | Pourquoi ce choix |
|---|---|---|
| **Longhorn** | StorageClass pour les PVC de Postgres et Redis (block storage) | Natif à l'écosystème Rancher/SUSE, installation en un clic, réplique automatiquement les volumes entre nœuds, snapshots intégrés. Pas besoin de matériel SAN externe |
| **MinIO** | Stockage S3-compatible pour : backups Postgres (`pgBackRest`/`WAL-G` avec PITR), config snapshots archivés, exports de reporting (CSV/XLSX) | Standard de facto pour ce type de données, réutilisable pour d'autres besoins futurs (ex: stocker les payloads de config historiques en JSON) |

⚠️ **NFS volontairement évité** pour Postgres/Redis : la latence et le modèle de verrouillage de fichiers posent des problèmes de fiabilité avec des bases transactionnelles. NFS reste pertinent uniquement pour de l'archivage non-critique si MinIO n'est pas souhaité.

### 1.7 Velero — sauvegarde de l'état du cluster

Distinct des backups Postgres : Velero sauvegarde les **manifests Kubernetes, PVC, et secrets** vers MinIO. Sans ça, un incident cluster (perte de configuration, erreur d'opérateur) ferait perdre non seulement les données mais aussi toute la définition du déploiement — Velero permet de restaurer l'état complet du cluster, pas juste les données métier.

### 1.8 PNETLab — pourquoi ça reste hors cluster

PNETLab nécessite la **virtualisation imbriquée (nested virtualization, VT-x/AMD-V)** pour faire tourner les 20 switches Dell OS10 virtuels — ce n'est pas un workload adapté à un pod Kubernetes standard (risqué en mode privileged, pas de support natif propre).

- **Option retenue actuellement** : VM dédiée séparée, hors du cluster Rancher. Le `gnmi-collector` et les drivers southbound (`drivers/arista_eos.py`, `drivers/nokia_srlinux.py`, `drivers/dell_os10.py`) s'y connectent depuis le cluster via le réseau.
- **Option future possible** : migrer vers **Harvester** (produit Rancher basé sur KubeVirt) pour faire tourner ces VM *à l'intérieur* d'un cluster Kubernetes, unifiant la gestion VM réseau + workloads applicatifs sous la même interface Rancher. Non retenu pour l'instant — complexité de migration non justifiée tant que le cluster applicatif n'est pas stabilisé.

### 1.9 Flux de déploiement — résumé

```
Client/Switch → MetalLB VIP → NGINX Ingress → Service fastapi-gateway
                                                       │
                                          (auth JWT, routing)
                                                       │
                              ┌────────────────────────┼────────────────────────┐
                              ▼                        ▼                        ▼
                    celery-workers              gnmi-collector          config-compliance-mgr
                       (Redis queue)              (PNETLab via réseau)      (snapshots → MinIO)
                              │                        │                        │
                              └────────────┬───────────┴────────────┬───────────┘
                                           ▼                        ▼
                                    PostgreSQL StatefulSet    Redis Sentinel StatefulSet
                                      (Longhorn PVC)              (Longhorn PVC)
```

---

## Partie 2 — Fonctionnalités SDN (la plateforme applicative)

### 2.1 Les 4 plans logiques du SDN Controller

| Plan | Rôle | Composants (mappés aux Deployments K8s) |
|---|---|---|
| **1. Consumption Plane** | Point d'entrée API, authentification | `fastapi-gateway` (`main.py`) + JWT/RBAC |
| **2. Policy & Management Plane** | Validation des intentions de config, orchestration | 4-Stage Pipeline (`main.py`) + `celery-workers` |
| **3. Telemetry & Visibility Plane** | Discovery temps réel, télémétrie, config lifecycle | `gnmi-collector` + `config-compliance-mgr` |
| **4. Southbound Plane** | Communication avec les équipements | Drivers `arista_eos.py` / `nokia_srlinux.py` / `dell_os10.py` |

### 2.2 Zero-Touch Provisioning (ZTP)

Permet à un switch jamais configuré de s'auto-enregistrer :

1. Le switch boot, envoie un `DHCP Discover` avec l'option ZTP.
2. Le serveur DHCP répond avec une IP + l'option 67 (URL du boot script).
3. Le switch exécute le script, qui poste vers `POST /api/v5/discovery/on-boarding-ingestion` (MAC, Serial, OS, Vendor) — **sans authentification**, car c'est l'option ZTP réseau elle-même qui valide l'origine.
4. Le controller crée/met à jour un enregistrement dans `ztp_discovery_pool` et répond `202 Accepted`.

### 2.3 Moteur de policy multi-tenant — Pipeline à 4 étages

Endpoint : `POST /api/v5/orchestrator/policy-enforcement`. Garantit qu'aucun tenant ne peut créer de conflit (VLAN/VRF/Subnet) avec un autre.

| Stage | Vérification | Échec |
|---|---|---|
| 1. Syntax Validation | Structures IP valides (`ipaddress.ip_network`), extraction des gateways | `400 Bad Request` |
| 2. Tenant Boundary Isolation | Pas d'overlap avec un subnet d'un autre tenant (`ipam_subnets`, `tenant_vrfs`) | `400 Bad Request` |
| 3. Topology & VLAN Collision | Switches cibles existants, pas de VLAN ID déjà utilisé par un autre VRF sur le même fabric | `400 Bad Request` |
| 4. Dry-Run Diff Engine | Génération du payload de config réel via le driver southbound | Si `dry_run=true` → retourne le diff sans appliquer. Sinon → commit + dispatch Celery |

### 2.4 Discovery topologique & Télémétrie temps réel (gNMI)

Remplace tout polling SNMP/SSH traditionnel par du **streaming push** :

- **LLDP Topology Discovery** : Subscribe gNMI sur `/system/lldp` (via `pygnmi`), mise à jour continue de `topology_edges`/`topology_nodes`.
- **Endpoint Tracking** : extraction des tables MAC/ARP des leaf switches → `discovered_endpoints`.
- **Telemetry Gathering** : octets in/out par interface, charge CPU, température chassis.
- En production, cible nativement **Nokia SR Linux, Arista EOS, Dell OS10**. En sandbox Containerlab, la télémétrie Dell est simulée à cause des limitations d'image virtuelle.

### 2.5 Config Lifecycle & Compliance

Cycle de vie d'un switch : `DiscoveredRaw` → snapshot initial → `CompliantActive` → audits périodiques → `PassRules`/`FailRules` → si drift manuel → `ConfigurationDrifted` → `TriggerRollback`.

**Règles d'audit actuelles** :
- NTP configuré (défaut `192.168.100.1`)
- DNS configuré (défaut `8.8.8.8`)
- AAA (authentification locale) activée — règle critique

**Blast-Radius Protection** :
- Rollback sur un Leaf → impact = 1 device
- Rollback sur un Spine → impact = toute la topologie (blast radius = 6)
- Si blast radius > 2 → **Four-Eyes Approval obligatoire**, réservé au rôle Platform Admin

### 2.6 Modèle de données (PostgreSQL)

| Table | Rôle |
|---|---|
| `users`, `tenants`, `tenant_vrfs` | Identité et isolation multi-tenant |
| `fabrics`, `fabric_blueprints` | Définition des fabrics physiques et leurs templates |
| `ipam_subnets`, `ipam_ip_allocations` | Gestion d'adresses IP, VRF-aware |
| `ztp_discovery_pool`, `switches` | Inventaire et onboarding |
| `topology_nodes`, `topology_edges` | Graphe topologique (LLDP/BGP) |
| `discovered_endpoints` | Endpoints MAC/IP appris |
| `telemetry_metrics`, `telemetry_metadata` | Séries de métriques opérationnelles |
| `config_snapshots` | Archives de config (append-only) |
| `compliance_runs`, `compliance_findings` | Résultats d'audit |

### 2.7 Référence API Northbound (résumé)

| Endpoint | Méthode | Fonction |
|---|---|---|
| `/api/v5/auth/login` | POST | Authentification → JWT |
| `/api/v5/orchestrator/policy-enforcement` | POST | Soumission d'intention réseau (dry-run supporté) |
| `/api/v5/orchestrator/policy-reconciliation` | POST | Suppression d'allocation + rollback |
| `/api/v5/discovery/on-boarding-ingestion` | POST | Ingestion ZTP (sans auth) |
| `/api/v5/visibility/snapshots` | POST/GET | Snapshot de config / historique |
| `/api/v5/visibility/rollback` | POST | Rollback avec évaluation blast-radius |
| `/api/v5/visibility/compliance/run` \| `/latest` | POST/GET | Audit de compliance |
| `/api/v5/visibility/endpoints` | GET | Endpoints appris |
| `/api/v5/visibility/telemetry` | GET | Séries télémétrie |
| `/api/v5/admin/stats` \| `/topology` | GET | Stats et graphe topologique |

### 2.8 Sécurité et RBAC applicatif

- **JWT Bearer** obligatoire pour toute écriture.
- 3 rôles : **Platform Admin** (tout), **Tenant Operator** (write scopé tenant), **Tenant Auditor** (read-only scopé tenant).
- Isolation stricte appliquée dès le Stage 2 du pipeline de policy — pas seulement au niveau JWT.

> ⚠️ Ne pas confondre ce RBAC **applicatif** (JWT, gestion des tenants réseau) avec le RBAC **Kubernetes** géré par Rancher (qui contrôle qui peut administrer le cluster lui-même) — deux couches d'autorisation totalement distinctes.

### 2.9 Roadmap fonctionnelle (gap vs périmètre cible type NacTrack)

| Fonctionnalité | Statut | Effort |
|---|---|---|
| BGP peering graph | ⚠️ Non implémenté | Moyen — ajouter un Subscribe gNMI sur `/network-instances/.../bgp` |
| Topologie ISIS / MPLS LDP | ❌ Non implémenté | Élevé — à ne lancer que si un cas d'usage métier l'exige |
| Compliance scoring & trending | ⚠️ Partiel | Faible — enrichir `compliance_runs` avec un champ score agrégé |
| Reporting & exports (CSV/XLSX) | ❌ Non implémenté | Faible — endpoint dédié + `pandas`/`openpyxl` + Celery Beat pour la planification |
| RBAC granulaire (40+ permissions) | ⚠️ Partiel (3 rôles fixes) | Moyen — étendre le claim JWT vers un modèle permission-based |
| Frontend interactif | ⚠️ À construire | Élevé — SPA React + react-flow/cytoscape.js |

---

## Partie 3 — Stack technique consolidée (déploiement + applicatif)

| Couche | Technologie |
|---|---|
| Orchestration de cluster | Rancher + RKE2 (Kubernetes) |
| Ingress | MetalLB + NGINX Ingress Controller |
| Autoscaling | HPA (Gateway), KEDA (Celery sur queue Redis) |
| Base de données | PostgreSQL via opérateur (CloudNativePG / Zalando) |
| Event bus / cache | Redis Sentinel (StatefulSet) |
| Stockage bloc (CSI) | Longhorn |
| Stockage objet (S3) | MinIO |
| Backup cluster | Velero |
| Backup Postgres (PITR) | pgBackRest / WAL-G |
| Monitoring infra | Prometheus + Grafana (intégrés Rancher) |
| API Gateway | FastAPI (`main.py`) |
| Validation policy | Pydantic + logique 4-stage custom |
| Discovery & télémétrie | gNMI (`pygnmi`), `gnmi_discovery.py`, `metrics_collector.py` |
| Config lifecycle | `config_lifecycle.py` |
| Orchestration jobs | Celery + Redis Streams |
| Drivers southbound | `drivers/nokia_srlinux.py`, `drivers/dell_os10.py`, `drivers/arista_eos.py` |
| Auth applicative | JWT Bearer (3 rôles) |
| Environnement de test réseau | PNETLab (20× Dell OS10, VM dédiée, nested virtualization) |

---

## Partie 4 — Prochaines étapes

1. Déployer le cluster RKE2 via Rancher, installer Longhorn et MinIO depuis le catalogue d'apps.
2. Choisir et déployer l'opérateur Postgres (CloudNativePG recommandé pour sa simplicité).
3. Containeriser les composants applicatifs existants (`main.py`, `gnmi_discovery.py`, `config_lifecycle.py`) en images Docker séparées par Deployment.
4. Configurer KEDA pour le scaling des Celery workers sur la profondeur de queue Redis.
5. Mettre en place Velero + le backup PITR Postgres vers MinIO avant toute mise en production, même en sandbox.
6. Garder PNETLab en VM séparée pour l'instant ; évaluer Harvester plus tard si besoin d'unification complète.
7. Prioriser le gap fonctionnel : compliance scoring/trending et reporting/export en premier (faible effort, forte valeur), BGP peering ensuite, ISIS/MPLS/L2VPN seulement si un besoin métier concret apparaît.
