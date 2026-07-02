# Plateforme de Discovery, Topologie & Config Lifecycle — Document d'Architecture Complet
## (Remplacement natif de NacTrack et Netdisco — gNMI + Ansible)

---

## 1. Objectif et périmètre

L'objectif est de retirer toute dépendance à **NacTrack** (proprietaire) et **Netdisco** (SNMP/CLI agentless), et de construire un module **maison**, intégré nativement à la stack SDN existante (Consumption → RBAC → Management → Policy → Data → Southbound), qui couvre :

1. **Discovery réseau et topologie temps réel** — via **gNMI** (streaming push), en remplacement du polling SNMP/SSH.
2. **Télémétrie opérationnelle** (compteurs, état des ports, PoE, hardware) — via **gNMI**.
3. **Cycle de vie de la configuration** (snapshot, archivage, compliance, rollback) — via **Ansible**, orchestré au-dessus de NETCONF/eAPI.
4. **Visualisation et opération** — via un **frontend maison** (pas de UI tierce), branché sur l'API existante du controller.
5. **Contrôle de policy strict** sur toute action de write (provisioning, restore, rollback) — extension de la pipeline de validation déjà en place.

Ce module constitue une nouvelle plane logique : la **Visibility, Telemetry & Config Lifecycle Plane**, qui vient se greffer sur l'architecture SDN existante sans la modifier en profondeur (aucune rupture sur la sécurité, le RBAC, le schéma de données ou le southbound déjà en place).

---

## 2. Description détaillée des fonctionnalités

### 2.1 Discovery topologique (remplace Netdisco)

| Fonction | Détail |
|---|---|
| Adjacences L2 (LLDP/CDP) | Subscribe gNMI sur `/lldp/interfaces/interface/neighbors`, mise à jour en push dès qu'un voisin apparaît/disparaît |
| Adjacences L3 (BGP EVPN/underlay) | Subscribe gNMI sur `/network-instances/network-instance/protocols/protocol[BGP]/bgp/neighbors` |
| Tables MAC/ARP (équivalent macsuck/arpnip) | Subscribe/Get gNMI sur `/network-instances/.../afts` (Abstract Forwarding Table) ; fallback OID vendor-native si `afts` non supporté |
| Inventaire matériel (chassis, PSU, fans, transceivers) | Get gNMI sur `/components` |
| Historique de connectivité des endpoints | Table `discovered_endpoints` alimentée en continu (mac, ip, vlan, switch_id, port, first_seen, last_seen) |
| Détection de changement topologique | Diff calculé à chaque event reçu, propagé en temps réel au frontend (WebSocket/SSE), sans polling côté client |

### 2.2 Télémétrie opérationnelle (remplace les métriques Netdisco + NacTrack)

| Fonction | Détail |
|---|---|
| Compteurs d'interface | Octets/sec, erreurs, discards — Subscribe gNMI `/interfaces/interface[name=*]/state` |
| État admin/link et historique up-down | Stocké en time-series, consultable comme "port history" |
| PoE (capacité, conso, état par port) | Get/Subscribe gNMI selon modèle YANG vendor |
| Uptime, version OS, nom système | `/system/state` |
| Dashboards temps réel par switch/interface | Frontend branché directement sur le Telemetry Store via l'API |

### 2.3 Config lifecycle (remplace les fonctions "config management" de NacTrack)

| Fonction | Détail |
|---|---|
| Snapshot/backup périodique de config | Playbook Ansible planifié, `backup: yes` sur les modules réseau, stocké en base |
| Archivage immuable | Table append-only, jamais d'update, hash + horodatage par snapshot |
| Diff / compliance vs golden-config | Comparaison automatisée par rôle (leaf/spine/tenant), résultats exposés via API et frontend |
| Rollback / restore | Playbook inverse, repush d'un snapshot historique |
| Reporting compliance multi-tenant (SOC2/ISO27001) | Agrégation périodique par tenant/fabric |

### 2.4 RBAC, multi-tenancy et contrôle de policy (renforce NacTrack)

| Fonction | Détail |
|---|---|
| Permissions granulaires (équivalent 40+ de NacTrack) | Extension du JWT claim vers un modèle permission-based (`topology:read`, `snapshot:restore`, `compliance:read`, `fabric:write`, etc.) au-dessus des 3 rôles existants |
| Multi-tenancy stricte | `tenant_id` validé à chaque requête, y compris côté inventaire dynamique Ansible et restore de snapshot (interdiction cross-tenant) |
| Dry-run obligatoire sur les actions destructives | `dry_run=true` par défaut sur tout restore/rollback, exécution réelle nécessitant un rôle explicite |
| Blast-radius check | Blocage/alerte si un changement impacterait plus de N devices simultanément (`max_concurrent_changes`) |
| Approbation à deux niveaux (four-eyes) | Optionnelle, activable par tenant/fabric pour les rollback en production |
| Audit immuable renforcé | Chaque action (y compris dry-run) loggée avec diff complet avant/après |

### 2.5 Frontend (remplace l'UI NacTrack)

| Module | Détail |
|---|---|
| Topology view | Graphe interactif (force-directed ou hiérarchique leaf-spine), overlay LLDP (physique) / BGP (logique) sélectionnable |
| Device inventory | Liste filtrable, détail composants/firmware/PoE |
| IPAM view | Réutilise le schéma existant, juste une nouvelle UI |
| Telemetry dashboards | Graphes temps réel par interface/switch |
| Compliance / audit viewer | Résultats de compliance, diff de config, historique de rollback |
| RBAC-aware | Affichage adapté selon les permissions du JWT de l'utilisateur connecté |

---

## 3. Architecture globale

```
                              ┌──────────────────────────┐
                              │   Frontend maison (SPA)   │
                              │ Topologie / IPAM / Audit  │
                              │ Telemetry / Compliance     │
                              └────────────┬──────────────┘
                                           │ REST / GraphQL / WebSocket
                              (via Consumption Plane existante : HAProxy + JWT/RBAC)
                              ┌────────────▼──────────────┐
                              │   Visibility API Service    │
                              │ (stateless, multi-instance) │
                              └──────┬──────────┬───────────┘
              ┌─────────────────────┘          └─────────────────────┐
              │                                                       │
  ┌───────────▼───────────┐                              ┌────────────▼────────────┐
  │  Policy Validation     │◄────────────────────────────│  Celery Beat / Worker     │
  │  Pipeline (existante,   │   dry-run / tenant check /  │ (gNMI events + Ansible   │
  │  étendue 4 stages)      │   blast-radius check        │  runner + provisioning)  │
  └───────────┬────────────┘                              └─────┬──────────┬─────────┘
              │                                                  │          │
   ┌──────────▼──────────┐   ┌────────────────────┐   ┌──────────▼───┐  ┌───▼─────────────┐
   │  Topology Builder     │   │  Telemetry Store    │   │ Ansible       │  │ NETCONF/eAPI     │
   │  (graphe, Postgres)    │   │  (TSDB)              │   │ Playbooks     │  │ provisioning      │
   └──────────▲────────────┘   └─────────▲────────────┘   │ (snapshot,    │  │ (VLAN/VRF/VXLAN, │
              │                          │                │ compliance,   │  │ existant 6.1)     │
   ┌──────────┴──────────────────────────┴──────┐         │ rollback)     │  └───────┬───────────┘
   │       gNMI Collector Pool (mTLS, Vault)      │         └───────┬───────┘          │
   └──────────────────────┬────────────────────────┘                 │                  │
                          │ gNMI Subscribe/Get                       │ NETCONF/eAPI     │ NETCONF/eAPI
              ┌───────────┼───────────┐                              │ (sous le capot)  │
        ┌─────▼─────┐ ┌────▼────┐ ┌────▼─────┐                       │                  │
        │ Leaf SW 1 │ │ Leaf SW2│ │ Spine SW N│◄──────────────────────┴──────────────────┘
        └───────────┘ └─────────┘ └───────────┘
```

**Principe directeur** : aucune nouvelle porte d'entrée parallèle vers les devices. Toute action de lecture passe par gNMI, toute action d'écriture (provisioning, snapshot, rollback) passe par la pipeline de policy existante avant d'atteindre NETCONF/eAPI — Ansible vient orchestrer ce dernier point, il ne le contourne pas.

---

## 4. Détail des composants et de leur rôle

### 4.1 gNMI Collector Pool
Service dédié (asyncio Python ou Go) maintenant une session Subscribe persistante par switch. Authentification mTLS / credentials dynamiques Vault. Publie les events reçus sur un bus interne (Redis Streams) consommé par le Topology Builder et le Telemetry Store.

### 4.2 Topology Builder
Service stateless consommant le flux gNMI pour maintenir le graphe topologique en Postgres (`topology_nodes`, `topology_edges`). Émet des events temps réel vers le frontend à chaque changement (nouveau voisin, lien down, etc.).

### 4.3 Telemetry Store
Base time-series (VictoriaMetrics ou InfluxDB) recevant les compteurs/métriques en continu, avec rétention et downsampling configurables par tenant/fabric.

### 4.4 Inventory / IPAM
Extension du schéma SQLAlchemy déjà existant (`switches`, `ipam_subnets`, etc.) avec les données matérielles issues de `/components` et la table `discovered_endpoints`.

### 4.5 Visibility API Service
API REST/GraphQL/WebSocket stateless, placée derrière la Consumption Plane existante (TLS, JWT/RBAC, tenant scoping hérités automatiquement). Expose topologie, télémétrie, compliance, snapshot/restore.

### 4.6 Ansible Config Lifecycle Layer
Playbooks exécutés via `ansible-runner` depuis les workers Celery existants. Inventaire dynamique généré depuis Postgres (scoping tenant/fabric/role automatique). Secrets via plugin Vault. Dry-run natif (`--check --diff`) réutilisé pour le mode validation obligatoire.

### 4.7 Policy Validation Pipeline (étendue)
Pipeline à 4 stages (syntax validation, tenant boundary isolation, topology pattern analysis, dry-run diff engine) déjà existante pour le provisioning, désormais également obligatoire pour toute action Ansible de restore/rollback. Ajout du blast-radius check et de l'option d'approbation à deux niveaux.

### 4.8 Frontend
SPA (React recommandé) consommant exclusivement l'API ci-dessus, sans dépendance à un produit tiers, avec rendu adapté au RBAC permission-based de l'utilisateur.

---

## 5. Modèle de données (extensions au schéma existant)

| Table | Rôle | Colonnes principales |
|---|---|---|
| `topology_nodes` | Noeuds du graphe topologique | switch_id, role (leaf/spine), fabric_id |
| `topology_edges` | Liens topologiques détectés | local_switch, local_port, remote_switch, remote_port, protocol (LLDP/BGP), last_seen, state |
| `discovered_endpoints` | Endpoints appris (MAC/ARP) | mac, ip, vlan, switch_id, port, first_seen, last_seen |
| `config_snapshots` | Snapshots de config (append-only) | id, switch_id, taken_at, raw_config, config_hash, taken_by |
| `compliance_runs` | Exécutions de contrôle de compliance | id, fabric_id/tenant_id, started_at, status, summary (json) |
| `compliance_findings` | Résultats détaillés par run | id, compliance_run_id, switch_id, rule_name, severity, detail |
| `telemetry_metadata` | Méta-données de métriques (rétention, mapping switch↔série) | switch_id, metric_name, retention_policy |

Toutes ces tables s'intègrent dans le même schéma SQLAlchemy et le même cluster Patroni PostgreSQL déjà décrits dans l'architecture SDN globale — aucune base de données séparée à opérer.

---

## 6. Outils et technologies utilisés

| Domaine | Outil / Technologie | Rôle | Alternative possible |
|---|---|---|---|
| Discovery & topologie | **gNMI** (protocole) | Streaming temps réel LLDP/BGP/ARP/interfaces/hardware | — |
| Client gNMI | `pygnmi` (Python) ou `gnmic` (Go) | Implémentation du client gNMI côté collector | `gnxi` tools |
| Runtime du collector | Service asyncio (Python) ou Go | Gestion de milliers de sessions Subscribe concurrentes | — |
| Bus d'événements interne | **Redis Streams** (déjà présent) | Découplage collector ↔ consommateurs (Topology Builder, Telemetry Store) | Kafka si volume très élevé |
| Time-series DB | **VictoriaMetrics** | Stockage des métriques de télémétrie | InfluxDB |
| Topology store | **PostgreSQL** (Patroni, déjà en place) | Graphe topologique relationnel | Neo4j (si requêtes de graphe complexes nécessaires) |
| API backend | **FastAPI** (Python) | Visibility API Service (REST/GraphQL/WebSocket) | Go (gin/echo) |
| Config lifecycle | **Ansible** + `ansible-runner` | Snapshot, compliance, rollback, orchestration multi-vendor | AWX/Tower (UI de scheduling avancée, optionnel) |
| Modules Ansible réseau | `arista.eos`, `dellemc.os10` | Backup/restore config sur les équipements supportés | `cisco.nxos` (préparation roadmap NX-OS) |
| Orchestration des jobs | **Celery** (pool déjà existant) | Exécution asynchrone des playbooks Ansible et du provisioning NETCONF/eAPI | — |
| Secrets | **HashiCorp Vault** (déjà en place) | Credentials dynamiques pour gNMI, NETCONF, eAPI, Ansible (plugin `hashi_vault`) | — |
| Sécurité transport | **mTLS** (déjà en place) | Toutes les connexions gNMI, NETCONF, eAPI, inter-services | — |
| Provisioning config (write path) | **NETCONF** (Dell OS10), **eAPI** (Arista EOS) | Push de config initiale VLAN/VRF/VXLAN (inchangé) | — |
| RBAC / Auth | **JWT** avec claims permission-based | Contrôle d'accès granulaire (équivalent 40+ permissions NacTrack) | — |
| Audit | Table immuable existante (4.3) étendue | Traçabilité de toute action incluant diff avant/après | — |
| Frontend | **React** + lib de graphe (react-flow / cytoscape.js) | Topologie interactive, dashboards, compliance viewer | Vue + vis-network |
| Temps réel frontend | **WebSocket** / Server-Sent Events | Push des changements topologiques et alertes sans polling | GraphQL subscriptions |
| ZTP / onboarding | DHCP + HTTPS phone-home signé (existant 7.1) | Inchangé, gNMI ne remplace pas cette étape | — |

---

## 7. Répartition claire des responsabilités

| Tâche | Protocole / Outil responsable |
|---|---|
| Discovery topologie temps réel (LLDP/BGP/ARP) | gNMI |
| Télémétrie compteurs/interfaces/hardware | gNMI |
| Onboarding initial d'un device inconnu | DHCP + phone-home HTTPS (ZTP existant) |
| Provisioning VLAN/VRF/VXLAN (config push initiale) | NETCONF (Dell) / eAPI (Arista), via Celery |
| Snapshot / backup / rollback de config | Ansible (orchestre NETCONF/eAPI) |
| Compliance / golden-config diff / audit | Ansible + stockage Postgres |
| Validation de toute action de write (provisioning ou rollback) | Policy Validation Pipeline (4 stages + blast-radius check) |
| Visualisation, RBAC, multi-tenancy | Visibility API + Frontend, héritant de la Consumption/RBAC Plane existante |

---

## 8. Fonctionnalités NacTrack/Netdisco non directement couvertes (limites connues)

| Fonction d'origine | Statut | Justification / alternative |
|---|---|---|
| NetBIOS / nom Windows des endpoints | Non couverte | Hors scope réseau pur ; nécessiterait un agent tiers, non prévu |
| Wireless SSID/clients (WLC) | Non couverte | Pas de WLC dans le scope actuel de l'architecture |
| STP port state | Partielle | Dépend du modèle YANG vendor-native ; à vérifier équipement par équipement |
| Tables MAC/ARP si `afts` non supporté | Partielle | Fallback sur OID vendor-native ou requête NETCONF ponctuelle |
| License authority Ed25519 (licensing produit) | Non applicable | Mécanisme conçu pour un produit commercial vendu ; outil interne n'en a pas besoin. Réutilisable via le même schéma de signature que le ZTP si un contrôle de déploiement air-gap est requis |
| Discovery passive d'un device totalement inconnu (hors ZTP) | Non couverte par gNMI | gNMI nécessite que le device soit déjà joignable/onboardé ; la détection d'un device "from scratch" reste portée par le pipeline ZTP (DHCP + phone-home) |

---

## 9. Prochaines étapes recommandées

1. Auditer le support OpenConfig/gNMI réel par modèle/version de switch cible (Arista EOS récent généralement bon ; Dell OS10 variable).
2. Prototyper le gNMI Collector sur un switch de test (`/interfaces` + `/lldp`) pour valider latence et volumétrie.
3. Implémenter les tables de données listées en section 5, dans le schéma SQLAlchemy existant.
4. Écrire et tester le premier playbook Ansible de snapshot (backup) avec inventaire dynamique Postgres → Vault → exécution → écriture résultat.
5. Définir un golden-config minimal par rôle (leaf/spine/tenant) pour démarrer la compliance (ex. : NTP configuré, AAA configuré, MTU cohérent).
6. Étendre le schéma JWT vers un modèle de permissions explicites plutôt que 3 rôles fixes, si la granularité RBAC de type NacTrack est requise dès le départ.
7. Décider si l'approbation à deux niveaux (four-eyes) et le blast-radius check sont activés par défaut ou opt-in par tenant/fabric.
