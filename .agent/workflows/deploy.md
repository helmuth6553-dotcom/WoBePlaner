---
description: Hotfix-Deploy direkt zu Cloudflare Pages (umgeht Git-Pipeline)
---

# Hotfix Deploy

> **Normalfall**: Einfach auf `main` mergen — Cloudflare deployed automatisch.
> Dieses Script nur für Notfall-Hotfixes nutzen, wenn die Git-Pipeline zu langsam ist.

// turbo-all

1. Build zuerst — wenn das fehlschlägt, passiert nichts:
```bash
npm run build
```

2. Direkt zu Cloudflare deployen:
```bash
npx wrangler pages deploy dist --project-name=wobeapp
```

3. Änderungen committen und pushen (damit Git synchron bleibt):
```bash
git add -A
git commit -m "Hotfix: $(date '+%Y-%m-%d %H:%M')" || echo "Nothing to commit"
git push || echo "Push failed, continuing..."
```

## Normaler Workflow

Für reguläre Features/Fixes den Branch-Workflow nutzen:
```bash
git checkout -b fix/mein-fix
# Arbeiten...
git push -u origin fix/mein-fix
gh pr create --title "Fix: ..." --body "..."
# CI prüft → Merge → Auto-Deploy
```
