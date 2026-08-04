# SDN Testing Guide — UI: Tenant Setup, Quick Form Helper & Pipeline Validation

> **Frontend URL**: `http://34.32.194.240:8080`  
> **Topology**: Dell OS10 spines (spine-01, spine-02) + Nokia SR Linux leaves  
> **Default Fabric**: `DataCenter-East` (ASN 65000)  
> **Default Tenant**: `Acme-Enterprise`

---

# Part 1: Tenant & Topology Setup (via UI)

Before running pipeline tests, you need a tenant with at least one VRF and subnet so that tenant boundary checks pass. All setup is done through the web UI.

### Prerequisites

| Item | Value |
|---|---|
| Frontend URL | `http://34.32.194.240:8080` |
| Admin credentials | Username: `admin`, Password: retrieve from server (see below) |
| Operator credentials | Username: `operator`, Password: retrieve from server |

**Get admin password** (run from the VM):
```bash
docker exec sdn_controller_app python -c "from app.scripts.seed_database import get_admin_password; print(get_admin_password())"
```

---

### Step 1: Login as Admin

1. Open `http://34.32.194.240:8080` in your browser
2. Enter username `admin` and the password from above
3. Click **Sign In**

**Expected**: You land on the dashboard. The sidebar shows **Tenant Management**, **Fabric Topology**, and other admin links (visible only to Platform Admin role).

---

### Step 2: Check Existing Fabric

1. In the sidebar, click **Tenant Management** (`/tenants`)
2. Scroll to the **Fabrics** section

**Expected**: You see a fabric named `DataCenter-East` with BGP ASN `65000`. This is the default fabric already seeded.

---

### Step 3: Check Existing Tenants

On the same **Tenant Management** page, look at the **Tenants** table.

**Expected**: You see a tenant named `Acme-Enterprise`. This is the default tenant.

---

### Step 4: Create Test Tenant "SDN-QA"

1. On the **Tenant Management** page (`/tenants`), click the **Create Tenant** button
2. A modal appears. Enter `SDN-QA` as the tenant name
3. Click **Create**

**Expected**: The new tenant `SDN-QA` appears in the tenants table with a unique UUID.

---

### Step 5: Create a VRF Under SDN-QA

1. In the sidebar, click **Tenant Fabric Mapping** (`/tenant-fabric-mapping`)
2. From the **Select Tenant** dropdown, choose **SDN-QA**
3. Click the **Add VRF** button
4. Fill in the VRF form:
   | Field | Value |
   |---|---|
   | VRF Name | `QA-Tenant-VRF` |
   | L3 VNI | `50101` |
   | Route Distinguisher | `auto` |
   | Route Target | `both auto` |
5. Click **Save**

**Expected**: The VRF `QA-Tenant-VRF` appears in the VRFs table with L3 VNI `50101`, RD `65000:50101`, RT `both 65000:50101`.

---

### Step 6: Create a Subnet Under the VRF

This ties the tenant to the fabric (required for tenant boundary check in Stage 2).

1. On the **Tenant Fabric Mapping** page, find `QA-Tenant-VRF` in the table
2. Click the expand arrow (▶) next to it to reveal subnets
3. Click **Add Subnet**
4. Fill in the subnet form:
   | Field | Value |
   |---|---|
   | Fabric | `DataCenter-East` |
   | VLAN ID | `101` |
   | L2 VNI | `10101` |
   | Subnet CIDR | `10.101.0.0/24` |
   | Anycast Gateway | `10.101.0.1` |
5. Click **Save**

**Expected**: The subnet appears under the expanded VRF row: VLAN `101`, CIDR `10.101.0.0/24`, gateway `10.101.0.1`.

The tenant `SDN-QA` now has an IP presence on `DataCenter-East`. This enables Stage 2 (tenant access check) to pass when targeting switches in this fabric.

---

### Step 7: View Dell Switches

1. In the sidebar, click **Switches** (`/switches`)
2. Look for Dell OS10 switches in the table

**Expected**: You see `spine-01` (mgmt `172.20.20.10`, serial `SN-DELL-SPINE1`) and `spine-02` (mgmt `172.20.20.13`, serial `SN-DELL-SPINE2`) with vendor `dell_os10` and role `spine`. Also present: leaf-01 through leaf-06 (Nokia).

---

### Step 8: Add Operator to SDN-QA Tenant

The operator account is seeded as a member of `Acme-Enterprise`. To test within the `SDN-QA` tenant context, add the operator to SDN-QA:

1. Stay logged in as **admin**
2. Go to **Users** page (`/users`)
3. Find the `operator` user in the table
4. Click the **pencil/edit** icon next to the operator user
5. In the edit modal, under **Tenant Role**, click **+** to add a new tenant entry
6. Select tenant `SDN-QA` and role `Tenant Operator`
7. Click **Save** or **Update**

> **Alternative**: If you just want to test the pipeline without switching tenants, the operator already works under `Acme-Enterprise` (which has all switches). The pipeline behavior is identical regardless of which tenant context you use.

---

### Step 9: Login as Operator (Different Browser/Incognito)

1. Open a private/incognito window or a different browser
2. Navigate to `http://34.32.194.240:8080`
3. Login with username `operator` and the operator password

**Expected**: The operator sees the **Config Push** page and other operator-accessible pages. The sidebar does NOT show **Tenant Management** or other admin links.

If the operator has **exactly one** tenant (e.g., only `Acme-Enterprise`), the tenant is auto-selected and switches appear immediately.
If the operator has **multiple** tenants (e.g., after adding SDN-QA in Step 8), a **Tenant Switcher** dropdown appears in the top header bar. Select `SDN-QA` from the dropdown.

---

# Part 2: Quick Form Helper — Complete Template Catalog

The **Quick Form Helper** (Builder mode in Step 2 of ConfigPushPage) offers **30 templates** across **10 categories**. Below is every template with its generated CLI lines and form fields.

## 2.1 Interface Category

### `interface-ethernet`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `interface {port}` | port | select | (fetched from live API: ethernet1/1/1–1/1/52) | No |
| `description {desc}` | desc | string | — | Yes |
| `mtu {mtu}` | mtu | integer | 576–9216, default 9216 | Yes |
| `switchport mode {mode}` | mode | select | `access`, `trunk` | Yes |
| `switchport access vlan {vlan_id}` | vlan_id | integer | 2–4094 | Yes |
| `switchport trunk allowed vlan {vlan_list}` | vlan_list | vlan_range | e.g. `100,200-300` | Yes |
| `no switchport` | — | boolean | toggle (when checked, makes port L3) | Yes |
| `ip address {ip_cidr}` | ip_cidr | cidr | e.g. `10.0.0.1/30` | Yes |
| `ip vrf forwarding {vrf}` | vrf | string | VRF name | Yes |
| `flowcontrol {fc}` | fc | select | `rx-desired`, `tx-desired`, `both` | Yes |
| `spanning-tree port type edge` | — | boolean | toggle | Yes |
| `{admin}` | admin | select | `no shutdown` (default), `shutdown` | No |

### `interface-loopback`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `interface loopback {id}` | id | integer | 0–1023 | No |
| `description {desc}` | desc | string | — | Yes |
| `ip address {ip_cidr}` | ip_cidr | cidr | e.g. `10.200.1.99/32` | No |
| `ip vrf forwarding {vrf}` | vrf | string | — | Yes |
| `no shutdown` | — | (fixed) | — | No |

### `interface-port-channel`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `interface port-channel {id}` | id | integer | 1–4096 | No |
| `description {desc}` | desc | string | — | Yes |
| `mtu {mtu}` | mtu | integer | 576–9216 | Yes |
| `switchport mode {mode}` | mode | select | `access`, `trunk` | Yes |
| `channel-group {id} mode {lacp_mode}` | lacp_mode | select | `active`, `passive`, `on` | Yes |
| `no shutdown` | — | (fixed) | — | No |

### `interface-mgmt`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `interface mgmt {id}` | id | integer | 0–1 | No |
| `description {desc}` | desc | string | — | Yes |
| `ip address {ip_cidr}` | ip_cidr | cidr | e.g. `172.20.20.99/24` | No |
| `no shutdown` | — | (fixed) | — | No |

---

## 2.2 VLAN Category

### `vlan-create`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `interface vlan {vlan_id}` | vlan_id | integer | 2–4094 | No |
| `description {name}` | name | string | default `APP-VLAN` | Yes |
| `no shutdown` | — | (fixed) | — | No |

### `vlan-name`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `vlan {vlan_id}` | vlan_id | integer | 2–4094 | No |
| `name {name}` | name | string | — | No |

### `vlan-tagged`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `interface {port}` | port | select | (fetched) | No |
| `switchport mode trunk` | — | (fixed) | — | No |
| `switchport trunk allowed vlan {vlan_list}` | vlan_list | vlan_range | e.g. `100,200-300` | No |

### `vlan-untagged`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `interface {port}` | port | select | (fetched) | No |
| `switchport mode access` | — | (fixed) | — | No |
| `switchport access vlan {vlan_id}` | vlan_id | integer | 2–4094 | No |

---

## 2.3 System Category

### `system-hostname`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `hostname {hostname}` | hostname | string | — | No |

### `system-ntp`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `ntp server {server}` | server | ip | IPv4 address | No |
| `ntp server {server2}` | server2 | ip | IPv4 address | Yes |

### `system-dns`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `ip name-server {dns1}` | dns1 | ip | IPv4 address | No |
| `ip name-server {dns2}` | dns2 | ip | IPv4 address | Yes |
| `ip domain-name {domain}` | domain | string | — | Yes |

### `system-syslog`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `logging server {server}` | server | ip | IPv4 address | No |
| `logging monitor {level}` | level | select | `emergencies`, `alerts`, `critical`, `errors`, `warnings`, `notifications`, `informational`, `debugging` | Yes |

### `system-snmp`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `snmp-server community {community} {access}` | community | string | — | No |
| | access | select | `ro`, `rw` | No |
| `snmp-server contact {contact}` | contact | string | — | Yes |
| `snmp-server location {location}` | location | string | — | Yes |
| `snmp-server host {host} version {version} {community}` | host | ip | — | Yes |
| | version | select | `1`, `2c`, `3` | Yes |

### `system-banner`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `banner exec {message}` | message | string | — | No |
| `banner login {login_msg}` | login_msg | string | — | Yes |
| `banner motd {motd}` | motd | string | — | Yes |

---

## 2.4 AAA Category

### `aaa-username`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `username {username} password {password} role {role} privilege {privilege}` | username | string | — | No |
| | password | string | — | No |
| | role | select | `sysadmin`, `netadmin`, `netoperator`, `securityadmin` | No |
| | privilege | integer | 0–15 | Yes |

### `aaa-enable`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `enable password {password}` | password | string | — | No |
| `enable secret {secret}` | secret | string | — | Yes |

### `aaa-authentication`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `aaa authentication login {method} {method2}` | method | select | `local`, `radius`, `tacacs+`, `ldap` | No |
| | method2 | select | `local`, `radius`, `tacacs+`, `ldap`, `none` | Yes |

### `aaa-ssh`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `ip ssh server` | — | (fixed) | — | No |
| `ip ssh port {port}` | port | integer | 1–65535, default 22 | Yes |
| `ip ssh version {version}` | version | select | `1`, `2` | Yes |
| `ip ssh time-out {timeout}` | timeout | integer | 1–120 (seconds) | Yes |
| `ip ssh authentication-retries {retries}` | retries | integer | 1–5 | Yes |

---

## 2.5 VRF Category

### `vrf-create`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `ip vrf {name}` | name | string | — | No |
| `vni {vni}` | vni | integer | 5000–16777214 | Yes |
| `rd {rd}` | rd | string | — | Yes |
| `route-target both {rt}` | rt | string | — | Yes |

### `vrf-interface`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `interface {port}` | port | select | (fetched) | No |
| `no switchport` | — | (fixed) | — | No |
| `ip vrf forwarding {vrf}` | vrf | string | VRF name | No |
| `ip address {ip_cidr}` | ip_cidr | cidr | — | No |

### `vrf-evpn`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `router bgp {asn}` | asn | integer | 1–65535 | No |
| `address-family l2vpn evpn` | — | (fixed) | — | No |
| `neighbor {peer} activate` | peer | ip | IPv4 | No |
| `advertise-all-vni` | — | (fixed) | — | Yes |

---

## 2.6 BGP Category

### `bgp-router`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `router bgp {asn}` | asn | integer | 1–65535 | No |
| `bgp router-id {router_id}` | router_id | ip | IPv4 | No |
| `maximum-paths {max_paths}` | max_paths | integer | 1–64, default 4 | Yes |

### `bgp-neighbor`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `router bgp {asn}` | asn | integer | 1–65535 | No |
| `neighbor {ip} remote-as {remote_as}` | ip | ip | IPv4 | No |
| | remote_as | integer | 1–65535 | No |
| `neighbor {ip} update-source loopback {loop_id}` | loop_id | integer | 0–1023 | Yes |
| `neighbor {ip} ebgp-multihop {hops}` | hops | integer | 1–255 | Yes |
| `neighbor {ip} password {pass}` | pass | string | — | Yes |

### `bgp-network`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `router bgp {asn}` | asn | integer | 1–65535 | No |
| `network {network} mask {mask}` | network | ip | Network address | No |
| | mask | ip | Subnet mask | No |

### `bgp-address-family`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `router bgp {asn}` | asn | integer | 1–65535 | No |
| `address-family {af}` | af | select | `ipv4 unicast`, `ipv6 unicast`, `l2vpn evpn` | No |
| `neighbor {peer} activate` | peer | ip | — | No |
| `network {network} mask {mask}` | network | ip | — | Yes |
| | mask | ip | — | Yes |

---

## 2.7 Static Route Category

### `ip-route`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `ip route {network} {mask} {next_hop}` | network | ip | Network address | No |
| | mask | ip | Subnet mask | No |
| | next_hop | ip | Next-hop IP | No |
| `ip route {network} {mask} {next_hop} {distance}` | distance | integer | 1–255 | Yes |

### `ip-default-route`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `ip route 0.0.0.0 0.0.0.0 {next_hop}` | next_hop | ip | Gateway IP | No |
| `ip route 0.0.0.0 0.0.0.0 {next_hop} {distance}` | distance | integer | 1–255 | Yes |

---

## 2.8 LAG Category

### `lag-port-channel`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `interface port-channel {id}` | id | integer | 1–4096 | No |
| `description {desc}` | desc | string | — | Yes |
| `switchport mode {mode}` | mode | select | `access`, `trunk` | Yes |
| `mtu {mtu}` | mtu | integer | 576–9216 | Yes |
| `no shutdown` | — | (fixed) | — | No |

### `lag-lacp-config`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `interface {port}` | port | select | (fetched) | No |
| `channel-group {id} mode {lacp_mode}` | id | integer | 1–4096 | No |
| | lacp_mode | select | `active`, `passive`, `on` | No |
| `no shutdown` | — | (fixed) | — | No |

---

## 2.9 STP Category

### `stp-mode`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `spanning-tree mode {mode}` | mode | select | `rstp`, `mst`, `pvst` | No |
| `spanning-tree priority {priority}` | priority | integer | 0–61440 (multiples of 4096) | Yes |
| `spanning-tree hello-time {sec}` | sec | integer | 1–10 (seconds) | Yes |
| `spanning-tree max-age {sec}` | sec | integer | 6–40 (seconds) | Yes |
| `spanning-tree forward-delay {sec}` | sec | integer | 4–30 (seconds) | Yes |

### `stp-port-edge`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `interface {port}` | port | select | (fetched) | No |
| `spanning-tree port type edge` | — | (fixed) | — | No |
| `spanning-tree bpduguard enable` | — | (fixed) | — | Yes |

### `stp-bpduguard`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `interface {port}` | port | select | (fetched) | No |
| `spanning-tree bpduguard enable` | — | (fixed) | — | No |
| `spanning-tree port type edge` | — | (fixed) | — | Yes |

---

## 2.10 QoS & ACL Category

### `ip-access-list`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `ip access-list {acl_name}` | acl_name | string | — | No |
| `seq {seq} {action} {protocol} {src} {dst}` | seq | integer | 1–65535 | No |
| | action | select | `permit`, `deny` | No |
| | protocol | select | `ip`, `tcp`, `udp`, `icmp` | No |
| | src | cidr | Source CIDR | No |
| | dst | cidr | Destination CIDR | No |

### `prefix-list`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `ip prefix-list {name} {action} {prefix}` | name | string | — | No |
| | action | select | `permit`, `deny` | No |
| | prefix | cidr | Prefix with CIDR | No |
| `ip prefix-list {name} {action} {prefix} ge {ge} le {le}` | ge | integer | 0–32 | Yes |
| | le | integer | 0–32 | Yes |

### `qos-class-map`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `class-map match-any {name}` | name | string | — | No |
| `match ip dscp {dscp}` | dscp | select | `0`, `8`, `10`, `16`, `18`, `24`, `26`, `32`, `34`, `40`, `46`, `48`, `56`, `cs1`–`cs7`, `af11`–`af43`, `ef` | No |

### `qos-policy-map`
| Generated Line | Field Name | Type | Range/Options | Optional |
|---|---|---|---|---|
| `policy-map type qos {name}` | name | string | — | No |
| `class {class_name}` | class_name | string | — | No |
| `set dscp {dscp}` | dscp | select | (same as above) | No |
| `police {cir} {bc}` | cir | integer | 1–100000000 (bps) | Yes |
| | bc | integer | 1–100000000 (bytes) | Yes |

---

# Part 3: Test Configs — One by One (via UI)

### How to Run Each Test

For every test below, follow these steps in the UI:

1. **Navigate**: Go to **Config Push** page (`/config-push`)
2. **Step 1 — Target Switches**: Select `spine-01` from the switch dropdown (it shows hostname + mgmt IP)
3. **Step 2 — Configure**:
   - Toggle to **CLI Editor** mode (the code/monospace textarea)
   - Paste or type the exact config shown in the test box
4. **Step 3 — Validate**: Click the **"Validate"** button
5. **Watch the 4-stage pipeline** progress display:
   - **Syntax** (stage 1)
   - **Tenant Boundary** (stage 2)
   - **Collision** (stage 3)
   - **Dry-Run** (stage 4)
6. **Check results**:
   - If a stage fails, it turns red with the error message in a red card below the stages
   - If all pass, you see a green card with the side-by-side diff viewer
   - Collision warnings appear in an amber/yellow card

> **UI Legend**:
> - ✅ **Green check** = stage passed
> - ❌ **Red X** = stage failed (pipeline stops)
> - 🟡 **Amber triangle** = collision warnings (non-blocking, pipeline continues)
> - ⏳ **Loading spinner** = stage in progress (all 4 spin simultaneously, then resolve one by one)

> **⚠️ If the switch dropdown is empty**: You see *"No switches available. Contact your administrator to assign this tenant to a fabric with switches."* This means the current tenant has no subnets on any fabric. Go back to **Part 1 — Tenant Setup** and ensure Steps 5–6 (VRF + subnet creation) are completed for this tenant. Then refresh the page.

---

### Test 1: Valid VLAN Creation
**Purpose**: Verify a clean new VLAN passes all 4 stages.

**Config** (paste into CLI Editor):
```
interface vlan 777
 description TEST-VLAN-SDN-QA
 no shutdown
```

**Expected UI result**:

| Stage | Status | What You See |
|---|---|---|
| 1. Syntax | ✅ success | Green check |
| 2. Tenant Boundary | ✅ success | Green check |
| 3. Collision | ✅ success | Green check, no warnings |
| 4. Dry-Run | ✅ success | Green check, side-by-side diff opens showing the new VLAN lines added |

**Collision Warnings Card**: Not shown (VLAN 777 is new, no conflicts).

**Diff viewer**: Shows `+interface vlan 777` / `+description TEST-VLAN-SDN-QA` / `+no shutdown` in the right panel (candidate config) vs left panel (running config).

---

### Test 2: Valid Interface Config (Access Port)
**Purpose**: Verify interface with access VLAN passes.

**Config**:
```
interface ethernet1/1/10
 description Test-Access-Port
 mtu 9216
 switchport mode access
 switchport access vlan 777
 no shutdown
```

**Expected UI result**:

| Stage | Status |
|---|---|
| 1. Syntax | ✅ success |
| 2. Tenant Boundary | ✅ success |
| 3. Collision | ✅ success (with amber warning card) |
| 4. Dry-Run | ✅ success |

**Collision Warnings Card** (amber):
```
[spine-01] Port ethernet1/1/10 currently assigned to VLAN 200 — reassigning to VLAN 777
```

---

### Test 3: Valid Trunk VLAN Config
**Purpose**: Verify trunk VLAN tagging passes.

**Config**:
```
interface ethernet1/1/5
 description Test-Trunk-Port
 switchport mode trunk
 switchport trunk allowed vlan 777,888-890
 no shutdown
```

**Expected UI result**:

| Stage | Status |
|---|---|
| 1. Syntax | ✅ success |
| 2. Tenant Boundary | ✅ success |
| 3. Collision | ✅ success (with amber warning card) |
| 4. Dry-Run | ✅ success |

**Collision Warnings Card** (amber):
```
[spine-01] Port ethernet1/1/5 currently assigned to VLAN 200 — reassigning
```

---

### Test 4: Syntax Error — Unrecognized Command
**Purpose**: Verify that garbage commands are caught in Stage 1.

**Config**:
```
blah blah blah
```

**Expected UI result**:

| Stage | Status | Detail |
|---|---|---|
| 1. Syntax | ❌ **failed** | Red X, error card appears |
| 2. Tenant Boundary | ⏳ pending | Grey (not reached) |
| 3. Collision | ⏳ pending | Grey (not reached) |
| 4. Dry-Run | ⏳ pending | Grey (not reached) |

**Error Card** (red):
```
Pipeline validation failed:
Line 1: Unrecognized command 'blah blah blah'
```

---

### Test 5: Range Error — VLAN ID Out of Range
**Purpose**: Verify VLAN ID boundary enforcement (2–4094).

**Config**:
```
interface vlan 0
 no shutdown
```

**Expected UI result**:

| Stage | Status |
|---|---|
| 1. Syntax | ❌ **failed** |
| 2–4 | ⏳ pending |

**Error Card** (red):
```
Line 1: VLAN ID '0' out of allowed range (2-4094)
```

**Variation**: Try `interface vlan 5000` → same error pattern.

---

### Test 6: Range Error — MTU Out of Range
**Purpose**: Verify MTU boundary enforcement (576–9216).

**Config**:
```
interface ethernet1/1/1
 mtu 9999
 no shutdown
```

**Expected UI result**:

| Stage | Status |
|---|---|
| 1. Syntax | ❌ **failed** |
| 2–4 | ⏳ pending |

**Error Card** (red):
```
Line 2: MTU '9999' out of allowed range (576-9216)
```

---

### Test 7: Range Error — STP Priority Not Multiple of 4096
**Purpose**: Verify STP priority enforcement (0–61440, multiples of 4096).

**Config**:
```
spanning-tree priority 1000
```

**Expected UI result**:

| Stage | Status |
|---|---|
| 1. Syntax | ❌ **failed** |
| 2–4 | ⏳ pending |

**Error Card** (red):
```
Line 1: STP bridge priority '1000' must be a multiple of 4096 (valid: 0-61440)
```

**Valid alternative**: `spanning-tree priority 4096` or `8192` or `12288` → all pass Stage 1.

---

### Test 8: Range Error — BGP ASN Out of Range
**Purpose**: Verify BGP ASN boundary enforcement (1–65535).

**Config**:
```
router bgp 0
 bgp router-id 10.0.0.1
```

**Expected UI result**:

| Stage | Status |
|---|---|
| 1. Syntax | ❌ **failed** |
| 2–4 | ⏳ pending |

**Error Card** (red):
```
Line 1: BGP ASN '0' out of allowed range (1-65535)
```

---

### Test 9: Valid Loopback IP
**Purpose**: Verify clean loopback config passes.

**Config**:
```
interface loopback 99
 description SDN-QA-Test-Loopback
 ip address 10.99.99.1/32
 no shutdown
```

**Expected UI result**:

| Stage | Status |
|---|---|
| 1. Syntax | ✅ success |
| 2. Tenant Boundary | ✅ success |
| 3. Collision | ✅ success (no amber card) |
| 4. Dry-Run | ✅ success, diff opens |

No collision warnings (loopbacks are virtual, not tracked in the collision DB).

---

### Test 10: IP Collision — Duplicate IP Address
**Purpose**: Verify IP collision is caught in Stage 3 and BLOCKS the push.

**Config**:
```
interface loopback 200
 description Duplicate-IP-Test
 ip address 10.200.1.10/32
 no shutdown
```

> **Context**: `10.200.1.10` is the seeded Loopback0 on spine-01. This triggers an IP collision **error**.

**Expected UI result**:

| Stage | Status | Detail |
|---|---|---|
| 1. Syntax | ✅ success | Green |
| 2. Tenant Boundary | ✅ success | Green |
| 3. Collision | ❌ **failed** | Red X, error card appears |
| 4. Dry-Run | ⏳ pending | Grey (not reached) |

**Error Card** (red):
```
COLLISION: [spine-01] IP '10.200.1.10' already assigned to another interface
```

---

### Test 11: VLAN Collision Warning
**Purpose**: Verify VLAN collision produces warning but does NOT block.

**Config**:
```
interface vlan 100
 description Collision-VLAN-Test
 no shutdown
```

> **Context**: VLAN 100 (`Uplink-Fabric`) already exists in seed data. Produces a collision **warning** only.

**Expected UI result**:

| Stage | Status | Detail |
|---|---|---|
| 1. Syntax | ✅ success | Green |
| 2. Tenant Boundary | ✅ success | Green |
| 3. Collision | ✅ success (with amber card) | Passed, but warning shown |
| 4. Dry-Run | ✅ success | Diff opens showing changes to existing VLAN |

**Collision Warnings Card** (amber):
```
[spine-01] VLAN ID(s) [100] already exist on this switch — config will merge
```

---

### Test 12: Port-Channel Collision Warning
**Purpose**: Verify port-channel collision warning.

**Config**:
```
interface port-channel 1000
 description Test-PC-Collision
 no shutdown
```

> **Context**: `port-channel1000` already exists in seed data (`SwitchLag`).

**Expected UI result**:

| Stage | Status |
|---|---|
| 1. Syntax | ✅ success |
| 2. Tenant Boundary | ✅ success |
| 3. Collision | ✅ success (with amber card) |
| 4. Dry-Run | ✅ success |

**Collision Warnings Card** (amber):
```
[spine-01] Port-channel 'port-channel1000' already exists
```

---

### Test 13: Port Already in Use Warning
**Purpose**: Verify port assignment collision warning.

**Config**:
```
interface ethernet1/1/1
 description Test-Port-In-Use
 switchport mode trunk
 switchport trunk allowed vlan 777
 no shutdown
```

> **Context**: `ethernet1/1/1` is a member of VLAN 100 and port-channel1000 in seed data.

**Expected UI result**:

| Stage | Status |
|---|---|
| 1. Syntax | ✅ success |
| 2. Tenant Boundary | ✅ success |
| 3. Collision | ✅ success (with amber card) |
| 4. Dry-Run | ✅ success |

**Collision Warnings Card** (amber) — two warnings:
```
[spine-01] Port ethernet1/1/1 currently assigned to VLAN 100 — reassigning
[spine-01] Port ethernet1/1/1 currently member of LAG port-channel1000 — reassigning
```

---

### Test 14: Valid Port-Channel + LAG
**Purpose**: Verify a NEW port-channel with LACP config passes cleanly.

**Config**:
```
interface port-channel 55
 description New-LAG-Test
 switchport mode trunk
 mtu 9216
 no shutdown

interface ethernet1/1/20
 description Member-of-PC55
 channel-group 55 mode active
 no shutdown
```

**Expected UI result**:

| Stage | Status |
|---|---|
| 1. Syntax | ✅ success |
| 2. Tenant Boundary | ✅ success |
| 3. Collision | ✅ success (no amber card) |
| 4. Dry-Run | ✅ success |

No collision warnings (port-channel55 and ethernet1/1/20 are not in seed data).

---

### Test 15: Valid VRF + Interface Binding
**Purpose**: Verify VRF creation with interface binding passes.

**Config**:
```
ip vrf QA-Test-VRF
 vni 50202
 rd 65000:50202
 route-target both 65000:50202

interface ethernet1/1/25
 description VRF-Test-Port
 no switchport
 ip vrf forwarding QA-Test-VRF
 ip address 10.202.0.1/30
 no shutdown
```

**Expected UI result**:

| Stage | Status |
|---|---|
| 1. Syntax | ✅ success |
| 2. Tenant Boundary | ✅ success |
| 3. Collision | ✅ success (no amber card) |
| 4. Dry-Run | ✅ success |

Port 25 is currently "down" in seed data but that does not affect validation.

---

### Test 16: Valid BGP Neighbor Config
**Purpose**: Verify BGP configuration passes.

**Config**:
```
router bgp 65001
 bgp router-id 10.200.1.99
 maximum-paths 4
 neighbor 10.200.1.10 remote-as 65000
 neighbor 10.200.1.10 update-source loopback 99
 neighbor 10.200.1.11 remote-as 65001
 neighbor 10.200.1.11 ebgp-multihop 2
```

**Expected UI result**:

| Stage | Status |
|---|---|
| 1. Syntax | ✅ success |
| 2. Tenant Boundary | ✅ success |
| 3. Collision | ✅ success (no amber card) |
| 4. Dry-Run | ✅ success |

---

### Test 17: Valid Static Route
**Purpose**: Verify static route config passes.

**Config**:
```
ip route 192.168.100.0 255.255.255.0 10.101.0.1
ip route 0.0.0.0 0.0.0.0 10.101.0.1 10
```

**Expected UI result**:

| Stage | Status |
|---|---|
| 1. Syntax | ✅ success |
| 2. Tenant Boundary | ✅ success |
| 3. Collision | ✅ success (no amber card) |
| 4. Dry-Run | ✅ success |

---

### Test 18: Complete Multi-Switch Config (Spine + Leaf)
**Purpose**: Validate a realistic multi-switch deployment config. Target **both** spine-01 and spine-02.

**UI steps**:
- In Step 1, select **both** spine-01 **and** spine-02 (Ctrl+click / multi-select)
- Paste the config in CLI Editor

**Config**:
```
interface vlan 888
 description Multi-Switch-Test-VLAN
 no shutdown

interface ethernet1/1/1
 description Uplink-to-Leaf-01
 mtu 9216
 switchport mode trunk
 switchport trunk allowed vlan 888
 no shutdown

router bgp 65000
 bgp router-id 10.200.1.10
 neighbor 10.200.1.11 remote-as 65001
 neighbor 10.200.1.11 ebgp-multihop 2
 neighbor 10.200.1.11 update-source loopback 0
```

**Expected UI result**:

| Stage | Status | Detail |
|---|---|---|
| 1. Syntax | ✅ success | All lines valid |
| 2. Tenant Boundary | ✅ success | SDN-QA has subnet on DataCenter-East (both switches) |
| 3. Collision | ✅ success (with amber card) | Port reassignment warnings for ethernet1/1/1 on both switches |
| 4. Dry-Run | ✅ success | Diff shows for each switch — VLAN 888 + interface + BGP lines |

**Collision Warnings Card** (amber):
```
[spine-01] Port ethernet1/1/1 currently assigned to VLAN 100 — reassigning
[spine-01] Port ethernet1/1/1 currently member of LAG port-channel1000 — reassigning
[spine-02] Port ethernet1/1/1 currently assigned to VLAN 100 — reassigning
[spine-02] Port ethernet1/1/1 currently member of LAG port-channel1000 — reassigning
```

**Diff viewer**: Shows 2 tabs/panels (one per switch), each with the same additions.

---

### Test 19: Empty Config Payload
**Purpose**: Verify empty/missing config is rejected before the pipeline.

**UI steps**:
- Leave the CLI Editor **completely empty** (or just whitespace)
- Click **Validate**

**Expected UI result**:

No stage indicators appear. An error message displays (the API rejects the request with a 422 validation error before the pipeline starts).

**Error**:
```
Config payload must not be empty
```

---

### Test 20: Non-Existent Switch
**Purpose**: Verify validation catches a switch that doesn't belong to the tenant's fabric.

**UI steps**:
- If using **operator** login: The switch list only shows switches in SDN-QA's fabric, so this can't happen in the UI normally.
- If using **admin** login: Select a switch from a different fabric (e.g., a switch not in DataCenter-East).

For this test, use **admin** login and select a switch that has no subnet belonging to SDN-QA.

**Expected UI result**:

| Stage | Status | Detail |
|---|---|---|
| 1. Syntax | ✅ success | Config is valid |
| 2. Tenant Boundary | ❌ **failed** | Red X — "Switch not found or access denied" |
| 3. Collision | ⏳ pending | Not reached |
| 4. Dry-Run | ⏳ pending | Not reached |

---

### Test 21: Live Commit (Non-Dry-Run)
**Purpose**: Verify commit mode queues deployment tasks.

**UI steps**:
- After a successful dry-run (e.g., Test 1), click **"Approve & Deploy"** button (or **"Commit"**) in Step 4
- You may need to enter a justification/description for the change

**Config** (same as Test 1):
```
interface vlan 777
 description TEST-VLAN-SDN-QA
 no shutdown
```

**Expected UI result**:

| Stage | Status |
|---|---|
| 1. Syntax | ✅ success |
| 2. Tenant Boundary | ✅ success |
| 3. Collision | ✅ success |
| 4a. Snapshot | ✅ success (pre-commit config saved) |
| 4b. Commit | ✅ **PUSH_QUEUED** |

**Result card**: Shows task IDs for each switch, e.g.:
```
Deployment queued for spine-01
Task ID: <celery-task-uuid>
```

You can check deployment history via the **History** tab or by navigating to `/config-push` history view.

---

# Summary: Expected Failure Matrix

| Test | Config | Stage Fails | What You See in UI |
|---|---|---|---|
| 1 | VLAN 777 | — | All green, diff opens |
| 2 | Interface access port | — | Green + amber warning card |
| 3 | Trunk VLAN | — | Green + amber warning card |
| 4 | `blah blah blah` | **Stage 1** | Red X on Syntax, error card |
| 5 | `interface vlan 0` | **Stage 1** | Red X, "VLAN out of range" |
| 6 | `mtu 9999` | **Stage 1** | Red X, "MTU out of range" |
| 7 | `spanning-tree priority 1000` | **Stage 1** | Red X, "must be multiple of 4096" |
| 8 | `router bgp 0` | **Stage 1** | Red X, "ASN out of range" |
| 9 | Loopback `10.99.99.1/32` | — | All green |
| 10 | IP collision `10.200.1.10` | **Stage 3** | Red X on Collision, error card |
| 11 | VLAN 100 already exists | — | Green + amber warning |
| 12 | Port-channel 1000 exists | — | Green + amber warning |
| 13 | `ethernet1/1/1` in use | — | Green + amber warning |
| 14 | New port-channel 55 | — | All green |
| 15 | VRF + interface L3 | — | All green |
| 16 | BGP neighbor config | — | All green |
| 17 | Static routes | — | All green |
| 18 | Multi-switch full config | — | Green + amber warnings per switch |
| 19 | Empty payload | **Before pipeline** | Error: "Config payload must not be empty" |
| 20 | Wrong switch | **Stage 2** | Red X, "access denied" |
| 21 | Live commit | — | Green, shows task IDs |

---

> **Note**: When using the **Builder** mode instead of CLI Editor, the same tests apply — you build the config visually using the templates from Part 2, then click "Insert to Editor" and proceed to Step 3. The pipeline behaves identically regardless of which mode you use to compose the config.
