

- **Mandatory Pre-Execution Protocol:** The AI assistant must NEVER execute any file edit, code modification, or database change in the codebase without first explaining the exact proposed solution and asking for explicit user approval. Non-modifying read-only checks, investigations, and remote infrastructure setups (like VM, PNetLab, and Docker status queries) do not require approval and can be run proactively to speed up setup.
- **Workflow Sequence (for code edits):**
  1. Explain the problem and proposed solution clearly.
  2. Specify the exact files involved.
  3. Ask for explicit user permission to proceed.
  4. Wait for user approval before making any edits.
- **Mandatory Nginx Permission Protocol:** Every frontend static build copy (`dist/`) to `sdn_frontend` container MUST ALWAYS be immediately followed by:
  `docker exec -i sdn_frontend chown -R nginx:nginx /usr/share/nginx/html && docker exec -i sdn_frontend chmod -R 755 /usr/share/nginx/html && docker exec -i sdn_frontend nginx -s reload`
  Failure to run this causes Nginx to return HTTP 403 / blank screen.

## Working Tree Note

Untracked and intentionally NOT committed: `Logo.png`, `dell_baseline_commands.cfg` (pre-existing, user-owned). Do not stage them unless asked.
