import subprocess
r = subprocess.run([
    'docker', 'exec', 'sdn_postgres_dev', 'psql', '-U', 'sdn_admin', '-d', 'sdn_controller', '-c',
    'SELECT username, substring(hashed_password,1,30) as hash_prefix FROM users;'
], capture_output=True, text=True, timeout=10)
print(r.stdout)
print(r.stderr)
