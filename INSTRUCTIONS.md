# Bricks Agent — Working Instructions for Claude

Critical rules learned from real failures in this project. Read this before touching any file.

---

## Git

- Flutter mobile (`bricks_agent`) → branch: **`master`**
- Backend (`bricks_agent_adminpanel_nodejs-main`) → branch: **`main`**
- Admin panel Flutter (`bricks_agent_adminpanel-master`) → **no git repo**, just a folder

### Push commands
```powershell
# Flutter mobile
cd C:\Users\keert\bricks_agent
git push origin master

# Backend
cd C:\Users\keert\bricks_agent_adminpanel_nodejs-main
git push origin main
```

### Stale index.lock (common issue)
The bash sandbox leaves stale `.git/index.lock` files after interrupted operations.
**Always delete from PowerShell before running git commands:**
```powershell
Remove-Item -Force "C:\Users\keert\bricks_agent\.git\index.lock"
Remove-Item -Force "C:\Users\keert\bricks_agent_adminpanel_nodejs-main\.git\index.lock"
```

---

## NTFS Mount — Stale File Views (CRITICAL)

The Linux bash sandbox mounts Windows NTFS folders. After using the `Edit` or `Write` tool
on Windows, the bash sandbox often sees a **stale, truncated version** of the file.

**Rules:**
1. After editing a file with the `Edit`/`Write` tool, ALWAYS validate via `node --check` in bash
2. If bash sees truncation or syntax errors but the `Read` tool (Windows) shows correct content,
   the bash view is stale — rewrite via Python:

```python
# Pattern to force-refresh the bash view:
with open('/sessions/.../file.js', 'w') as f:
    f.write(correct_content)
```

3. If a Python append was used to fix truncation in a previous session, CHECK the file for
   duplicate content (two `module.exports` lines, orphaned fragments after the last `}`).
   Use this pattern to trim safely:

```python
with open(path, 'rb') as f:
    raw = f.read()
marker = b'module.exports = {...};'
idx = raw.rfind(marker)
clean = raw[:idx + len(marker)] + b'\n'
with open(path, 'wb') as f:
    f.write(clean)
```

---

## Validation Before Every Commit

ALWAYS run `node --check` on every modified/created backend file before committing:

```bash
node --check Controller/order.js
node --check Controller/masonry.js
node --check Controller/builder.js
node --check Middleware/index.js
node --check Routes/index.js
# etc.
```

If any file fails — fix it, even if the Windows Read tool shows it looks correct.
The bash syntax check is the ground truth for what Render will see.

---

## Render Deployment

- Backend live URL: https://bricks-agent-backend.onrender.com/
- Auto-deploys on push to `main`
- Render runs Node.js v26 — any syntax error in any `require()`d file crashes the entire server
- After pushing, watch Render logs for `SyntaxError` or `Cannot find module` before assuming deploy succeeded
- Render retries deploys — if it failed once and then succeeded, the latest successful run is what matters
- The `MemoryStore` session warning is harmless (expected on free tier with no Redis)
- NEVER use Unicode box-drawing chars (─, —, │) in .js files — use plain ASCII dashes in comments

---

## Backend File Corruption Patterns (seen in this project)

| Pattern | Cause | Fix |
|---|---|---|
| Duplicate `module.exports` at end of file | Python append ran twice or over old content | `rfind` the marker, slice to that point |
| File truncated mid-string | Edit tool + multi-byte chars (emoji) on NTFS | Rewrite via Python `open(path,'w')` |
| Middleware missing closing `}` | Edit left stale view cached | Python full rewrite of Middleware/index.js |

---

## User Preferences

- Always check memory, task list, and conversation history before starting work
- Never suggest `git push origin main` for the Flutter repo — it's `master`
- Never suggest `git push origin master` for the backend — it's `main`
- Verify branch with `git branch` before suggesting push commands
- Do not jump into new work without reviewing the full current state first
