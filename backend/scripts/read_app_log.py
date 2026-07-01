import subprocess

def run_ssh_cmd(cmd_str):
    cmd = [
        "ssh", "-o", "StrictHostKeyChecking=no",
        "-i", "C:/Users/mosta/.gemini/antigravity-ide/scratch/id_rsa_gcp",
        "mostafafaouzi89@34.90.176.247",
        cmd_str
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print(f"=== Command: {cmd_str} ===")
    print("STDOUT:\n", res.stdout)
    if res.stderr:
        print("STDERR:\n", res.stderr)

run_ssh_cmd("tail -n 50 /home/mostafafaouzi89/sdn-controller/app.log")
