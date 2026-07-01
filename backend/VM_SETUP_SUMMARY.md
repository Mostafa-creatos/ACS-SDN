# VM Setup & Deployment Summary

This document summarizes the configurations, files, containers, and deployment steps completed for the **Enterprise SDN Controller** and **Containerlab Switch Fabric** on your Google Cloud VM.

---

## 1. VM Details & Cloud Shell Access

*   **Instance Name**: `sdn-host-vm`
*   **Zone**: `europe-west4-a`
*   **External IP**: `34.90.176.247`
*   **VM Username**: `mostafafaouzi89`

### How to Access the VM from Google Cloud Shell
Since Cloud Shell is already authenticated to your project, you can log into your VM instantly by running this single command:
```bash
gcloud compute ssh sdn-host-vm --zone=europe-west4-a
```
*Once you paste this command and hit Enter, you will be SSH'd directly into the VM terminal as user `mostafafaouzi89`.*

---

## 2. Setup Summary

### A. Environment & Packages Installed on the VM Host
We prepared the host system by installing the following tools:
*   **`docker-compose`**: For starting Postgres and Redis containers.
*   **`python3-pip` & `python3-venv`**: For managing python packages and dependencies.
*   **Containerlab**: Pre-installed and ready.
*   **File Permissions**: Granted traversal permissions (`sudo chmod o+x /home/mostafafaouzi89`) and read permissions (`sudo chmod -R o+rX /home/mostafafaouzi89/netdisco-config`) to allow non-root container users (like the Netdisco user UID 901) to cross your home directory and read configuration files.

### B. Files Copied to the VM
Your workspace files were copied from your local machine to `/home/mostafafaouzi89/sdn-controller/`:
*   `app/` (FastAPI controller logic, drivers, database connection schema)
*   `scripts/` (contains ZTP bootstrap automation script)
*   `requirements.txt` (FastAPI and development dependencies)
*   `docker-compose.yml` (PostgreSQL and Redis services)
*   `.env` (SDN Controller variables)
*   `sdn_fabric.clab.yml` (Containerlab switches and Netdisco network definition)

### C. Services & Containers Running

1.  **Databases (Docker Compose)**:
    Spun up Postgres (`sdn_postgres_dev`) on port 5432 and Redis (`sdn_redis_dev`) on port 6379 for the controller.
2.  **Switch Fabric (Containerlab)**:
    Launched Nokia SR Linux nodes (`leaf-01`, `leaf-02`, `spine-01`) and Netdisco discovery tools.
3.  **Netdisco Database Schema & Session Configuration**:
    *   Executed database deployment migrations (`netdisco-db-deploy`) inside the backend container.
    *   Injected the required session cookie secret key directly into the Netdisco `sessions` database table to resolve Dancer startup crashes.
4.  **FastAPI SDN Controller Application**:
    *   Created a virtual environment (`venv`) and installed dependencies.
    *   Launched the application in the background using `nohup` on port 8000. It automatically connected to Postgres, ran schema creation, and seeded default data.

---

## 3. Active Containers List
If you run `docker ps` on the VM, you will see the following active containers:
*   `clab-sdn-fabric-netdisco-web` (Netdisco Web UI, bound to host port 5000)
*   `clab-sdn-fabric-netdisco-backend` (Netdisco daemon/discovery agent)
*   `clab-sdn-fabric-netdisco-db` (Netdisco database container)
*   `clab-sdn-fabric-leaf-01` (Nokia SR Linux Leaf 1, IP 172.20.20.11)
*   `clab-sdn-fabric-leaf-02` (Nokia SR Linux Leaf 2, IP 172.20.20.12)
*   `clab-sdn-fabric-spine-01` (Nokia SR Linux Spine 1, IP 172.20.20.10)
*   `sdn_postgres_dev` (Controller PostgreSQL DB, bound to host port 5432)
*   `sdn_redis_dev` (Controller Redis cache/queue, bound to host port 6379)

---

## 4. How to Manage Services on the VM

### Start/Stop the Switch Fabric (Containerlab)
```bash
# To destroy/stop the switch containers:
cd ~/sdn-controller
sudo containerlab destroy -t sdn_fabric.clab.yml

# To deploy/start the switches:
sudo containerlab deploy -t sdn_fabric.clab.yml
```

### Start/Stop the Databases
```bash
cd ~/sdn-controller
docker-compose down     # Stop
docker-compose up -d    # Start
```

### Restart/Check the FastAPI App
```bash
# View running FastAPI processes
ps aux | grep uvicorn

# View FastAPI app logs
cat ~/sdn-controller/app.log
```

---

## 5. How to Launch the Project (Full Start-Up Guide)

Follow these steps **in order** every time you start the VM fresh or after a reboot.

### Step 1 — Start the VM
Go to [Google Cloud Console → Compute Engine → VM Instances](https://console.cloud.google.com/compute/instances), find **`sdn-host-vm`** and click **Start / Resume**.
Wait ~30 seconds for it to boot. The **External IP** may change if it is not reserved — check the console for the current IP.

### Step 2 — SSH into the VM
From **Google Cloud Shell** (recommended — no keys needed):
```bash
gcloud compute ssh sdn-host-vm --zone=europe-west4-a
```

Or from your **local terminal** (using the saved key):
```bash
ssh -i ~/.ssh/id_rsa_gcp mostafafaouzi89@<EXTERNAL_IP>
```

### Step 3 — Start the Databases (PostgreSQL & Redis)
```bash
cd ~/sdn-controller
docker-compose up -d
```
Verify both containers are running:
```bash
docker ps | grep -E "postgres|redis"
```

### Step 4 — Deploy the Switch Fabric (ContainerLab)
```bash
cd ~/sdn-controller
sudo containerlab deploy -t sdn_fabric.clab.yml
```
This starts the 3 SR Linux nodes (`leaf-01`, `leaf-02`, `spine-01`) and the 3 Netdisco containers.
Verify all 6 containers are up:
```bash
docker ps
```

### Step 5 — Start the FastAPI SDN Controller
```bash
cd ~/sdn-controller
source venv/bin/activate
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > app.log 2>&1 &
```
Confirm it is running:
```bash
ps aux | grep uvicorn
# You should see a uvicorn process listed
```
The API is now accessible at: `http://<EXTERNAL_IP>:8000`
Swagger docs: `http://<EXTERNAL_IP>:8000/docs`

### Step 6 — Access the Netdisco Web UI
Open your browser and go to:
```
http://<EXTERNAL_IP>:5000
```
Login with the Netdisco admin credentials that were configured during setup.

### Step 7 — Trigger Network Discovery (Optional)
To rediscover the SR Linux nodes from inside the backend container:
```bash
docker exec clab-sdn-fabric-netdisco-backend netdisco-do discover -d <DEVICE_IP>
# Example for all three nodes:
docker exec clab-sdn-fabric-netdisco-backend netdisco-do discover -d 172.20.20.10
docker exec clab-sdn-fabric-netdisco-backend netdisco-do discover -d 172.20.20.11
docker exec clab-sdn-fabric-netdisco-backend netdisco-do discover -d 172.20.20.12
```

---

## 6. Full Shutdown Checklist

Run these steps **in reverse order** to cleanly stop everything:

```bash
# 1. Stop the FastAPI app
pkill -f uvicorn

# 2. Destroy the switch fabric and Netdisco containers
cd ~/sdn-controller
sudo containerlab destroy -t sdn_fabric.clab.yml

# 3. Stop the databases
docker-compose down
```
Then go to **GCP Console → VM Instances → Stop** to stop the VM and avoid billing.
