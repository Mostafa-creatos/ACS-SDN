import subprocess

playbook = "/workspace/southbound-ansible/playbooks/base_provisioning.yml"
res = subprocess.run(
    [
        "ansible-playbook", playbook,
        "-i", "172.20.20.13,",
        "-e", "ansible_user=admin ansible_password=admin ansible_network_os=dellos10 ansible_connection=network_cli ansible_network_cli_ssh_type=ssh",
        "-vvv"
    ],
    capture_output=True, text=True
)
print("=== RETURN CODE ===")
print(res.returncode)
print("=== STDOUT ===")
print(res.stdout)
print("=== STDERR ===")
print(res.stderr)
