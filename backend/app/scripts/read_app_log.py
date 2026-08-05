import subprocess
import os

SSH_KEY  = os.path.expanduser("~/.ssh/id_rsa")
REMOTE   = "alkhairplateforme@34.32.194.240"
LOG_PATH = "~/sdn-controller/app.log"

def run_ssh_cmd(cmd_str):
    cmd = [
        "ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=15",
        "-i", SSH_KEY,
        REMOTE,
        cmd_str
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print(f"=== Command: {cmd_str} ===")
    print("STDOUT:\n", res.stdout)
    if res.stderr:
        print("STDERR:\n", res.stderr)

run_ssh_cmd(f"tail -n 50 {LOG_PATH}")
