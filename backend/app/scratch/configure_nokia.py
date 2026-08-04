import subprocess
import sys

def configure_switch(container_name):
    print(f"Configuring {container_name}...")
    commands = (
        "enter candidate\n"
        "/ interface ethernet-1/10 subinterface 0 type bridged admin-state enable\n"
        "/ network-instance macvrf-access type mac-vrf admin-state enable interface ethernet-1/10.0\n"
        "/ network-instance macvrf-access protocols stp admin-state enable\n"
        "commit stay\n"
    )
    p = subprocess.Popen(
        ['docker', 'exec', '-i', container_name, 'sr_cli'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    out, err = p.communicate(commands)
    print(f"STDOUT for {container_name}:")
    print(out)
    print(f"STDERR for {container_name}:")
    print(err)

if __name__ == '__main__':
    configure_switch('clab-sdn-fabric-dell-spines-leaf-01')
    configure_switch('clab-sdn-fabric-dell-spines-leaf-03')
    print("Configuration applied.")
