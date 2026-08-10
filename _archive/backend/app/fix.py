with open('main.py', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
new_lines = []
in_func = False
needs_patch = False
func_indent = ''
i = 0

while i < len(lines):
    line = lines[i]
    if line.startswith('def ') and 'claims' in line:
        # Check if the function signature spans multiple lines
        while not line.strip().endswith('):') and not line.strip().endswith(') -> dict:') and not line.strip().endswith(') -> list:') and not line.strip().endswith('): '):
            new_lines.append(line)
            i += 1
            line = lines[i]
        
        in_func = True
        needs_patch = True
        new_lines.append(line)
        i += 1
        continue
    
    if in_func and needs_patch:
        if line.strip() == '' or line.strip().startswith('#') or line.strip().startswith('\"\"\"') or line.strip().startswith('\'\'\''):
            new_lines.append(line)
            i += 1
            continue
            
        # found first line of code in function
        func_indent = line[:len(line) - len(line.lstrip())]
        
        # Check if we should inject
        new_lines.append(func_indent + 'user_role = claims.get("role")')
        new_lines.append(func_indent + 'user_tenant_id = claims.get("tenant_id")')
        needs_patch = False
        new_lines.append(line)
        i += 1
        continue
        
    new_lines.append(line)
    i += 1

# Since we injected user_role into ALL functions with claims, we don't even need to check if it's used.
# But we might have duplicated it if it was already there. Let's do a basic deduplication.
deduped_lines = []
skip_next = False
for j, line in enumerate(new_lines):
    if skip_next:
        skip_next = False
        continue
    
    if line.strip() == 'user_role = claims.get("role")':
        # check if next line is also user_role
        if j+1 < len(new_lines) and new_lines[j+1].strip() == 'user_role = claims.get("role")':
            skip_next = True
    deduped_lines.append(line)

final_lines = []
skip_next_tenant = False
for j, line in enumerate(deduped_lines):
    if skip_next_tenant:
        skip_next_tenant = False
        continue
    if line.strip() == 'user_tenant_id = claims.get("tenant_id")':
        if j+1 < len(deduped_lines) and deduped_lines[j+1].strip() == 'user_tenant_id = claims.get("tenant_id")':
            skip_next_tenant = True
    final_lines.append(line)

with open('main.py', 'w', encoding='utf-8') as f:
    f.write('\n'.join(final_lines))
print("Done fixing main.py")
