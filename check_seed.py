import subprocess

script = """
import sqlite3
# Check if postgres is available
import os
db_url = os.getenv("DATABASE_URL", "")
print("DB URL:", db_url[:30] if db_url else "none")
"""

# First let's check the docker logs for the seed password
result = subprocess.run(["ssh", "-i", "C:\\Users\\mosta\\.ssh\\id_rsa", "-o", "StrictHostKeyChecking=no", "alkhairplateforme@34.32.194.240", "docker logs sdn_controller_app 2>&1 | grep -i 'seed\\|admin.*password\\|Generated'"], capture_output=True, text=True)
print("Seed logs:")
print(result.stdout)
print(result.stderr)
