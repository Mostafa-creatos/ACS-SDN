# Enterprise SDN Controller — Start-Up & Launch Guide

This guide provides step-by-step instructions to boot the VM, initialize the databases, launch the Nokia Switch Fabric, run the SDN Controller, and access the interactive Admin UI.

---

## 1. Connect to the Google Cloud VM
First, make sure the `sdn-host-vm` instance is started in the Google Cloud Console.

### From Google Cloud Shell (Recommended)
Run this single command in Cloud Shell to authenticate and SSH into the VM:
```bash
gcloud compute ssh sdn-host-vm --zone=europe-west4-a
```

### From Local Terminal (Using SSH Key)
```bash
ssh -i ~/.ssh/id_rsa_gcp mostafafaouzi89@34.90.176.247
```

---

## 2. Start all Services (Step-by-Step)

### Step A: Change to the Project Directory
Navigate to the root directory where the configuration files are located:
```bash
cd ~/sdn-controller
```

### Step B: Start Postgres & Redis Databases
Spin up the database backplane containers:
```bash
docker-compose up -d
```
*Verify that both containers (`sdn_postgres_dev` and `sdn_redis_dev`) are running:*
```bash
docker ps | grep -E "postgres|redis"
```

### Step C: Deploy the Switch Fabric (Containerlab)
You can choose to deploy either of the two switch fabric topologies:

#### Option 1: Default Mixed-Vendor Topology (1 Nokia Spine, 1 Nokia Leaf, 1 Dell OS10 Leaf)
```bash
sudo containerlab deploy -t sdn_fabric.clab.yml
```

#### Option 2: Scaled Topology (2 Dell OS10 Spines, 5 Nokia SR Linux Leafs)
```bash
sudo containerlab deploy -t sdn_fabric_dell_spines.clab.yml
```
*Verify all 6 containerlab containers are running:*
```bash
docker ps
```

### Step D: Launch the FastAPI SDN Controller App
Start the controller application process in the background. It will automatically detect the empty database and seed it with the three active Nokia switch records:
```bash
source venv/bin/activate
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > app.log 2>&1 < /dev/null &
```
*Confirm the process is running successfully:*
```bash
ps aux | grep uvicorn
```
*Watch the live startup/seeding logs:*
```bash
tail -n 30 app.log
```

---

## 3. Accessing the Web Interfaces & Dashboards

Once everything is started, you can access the following dashboards in your web browser using your VM's public IP address (**`34.90.176.247`**):

| UI Service | URL Path | Description |
| :--- | :--- | :--- |
| **🚀 SDN Admin Dashboard** | `http://34.90.176.247:8000/` | Interactive glassmorphic Admin SPA containing Switch Inventory, ZTP Pools, Subnet Allocators, Policy Intent Engine, and Live Topology Map. |
| **swagger FastAPI Docs** | `http://34.90.176.247:8000/docs` | Standard OpenAPI document catalog to inspect, run, and validate northbound REST API endpoints. |
| **🌐 Netdisco Web Console** | `http://34.90.176.247:5000/` | Real-time discovery topology database web panel. |

---

## 4. Troubleshooting & Clean Shutdown

### How to stop all services cleanly:
To stop all containers and uvicorn processes to free up resources or avoid cloud billing:
```bash
# 1. Kill the controller process
pkill -f uvicorn

# 2. Destroy the container switch fabric
cd ~/sdn-controller
sudo containerlab destroy -t sdn_fabric.clab.yml

# 3. Stop the Postgres and Redis databases
docker-compose down
```
