import os
import re

file_path = "main.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# We need to find all functions that take 'claims: dict = Depends(...)'
# and if they use 'user_role' or 'user_tenant_id' without defining them,
# we insert the definitions at the start of the function block.

def patch_function(match):
    func_header = match.group(1)
    func_body = match.group(2)
    
    # Check if user_role or user_tenant_id is used
    uses_role = "user_role" in func_body
    uses_tenant = "user_tenant_id" in func_body
    
    # Check if they are already defined
    defines_role = "user_role =" in func_body
    defines_tenant = "user_tenant_id =" in func_body
    
    insertions = []
    if uses_role and not defines_role:
        insertions.append('    user_role = claims.get("role")')
    if uses_tenant and not defines_tenant:
        insertions.append('    user_tenant_id = claims.get("tenant_id")')
        
    if insertions:
        # Insert them right after the function signature
        lines = func_body.split('\n')
        # Find the first line that is indented by 4 spaces
        for i, line in enumerate(lines):
            if line.startswith('    ') and line.strip() != "":
                # Insert before this line
                lines = lines[:i] + insertions + lines[i:]
                break
        func_body = '\n'.join(lines)
        
    return func_header + func_body

# Match the function signature and the entire body until the next function
pattern = re.compile(r'(def\s+[a-zA-Z0-9_]+\([^:]*claims\s*:\s*dict[^:]*\)\s*(?:->\s*[^:]+)?:\s*\n)(.*?(?=\ndef\s|\Z))', re.DOTALL)
new_content = pattern.sub(patch_function, content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)
    
print("Patch complete.")
