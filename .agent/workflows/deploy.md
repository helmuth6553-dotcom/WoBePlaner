---
description: Deploy the app to Cloudflare Pages (with Git backup)
---

# Deploy to Cloudflare Pages

// turbo-all

1. Stage all changes:
```bash
git add -A
```

2. Commit with a timestamp message:
```bash
git commit -m "Deploy: %date% %time%"
```

3. Push to remote repository:
```bash
git push
```

4. Build the production bundle:
```bash
npm run build
```

5. Deploy to Cloudflare Pages:
```bash
npx wrangler pages deploy dist --project-name=wobeapp
```

The app will be deployed to https://wobeapp.pages.dev

## Notes
- Git commit and push happens BEFORE build/deploy
- If push fails (no remote configured), deploy continues anyway
- Wrangler is installed as a dev dependency
