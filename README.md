# Shoe Cleaning Site

Single-page marketing site with a live admin editor. **GitHub is the source of truth for everything** — code, content, and photos all live in this repo.

## Files

- `index.html` — the public site. Renders content from `content.json`.
- `content.json` — all editable content (packages, wording, contact info, photo paths).
- `photos/` — before/after photos (created automatically on first photo save).
- `admin.html` — password-protected editor at `/admin.html`.
- `api/save.js` — serverless function that commits admin edits to this repo via the GitHub API.

## How publishing works

1. You edit content or add photos at `/admin.html` and hit **Save**.
2. The API makes **one git commit** to this repo ("Content update via admin") containing the updated `content.json` and any new photos.
3. Vercel sees the commit and redeploys — changes are live in ~30–60 seconds.

Every edit is a commit: you can see it, diff it, and revert it on GitHub, and `git pull` in VS Code always gives you the complete, current site. (Tip: pull before making code changes so you have the latest content commits.)

## One-time setup

1. **Create a GitHub token**: GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token. Under "Repository access" select **Only select repositories** → this repo. Under "Permissions" → Repository permissions → **Contents: Read and write**. Nothing else. Copy the token.
2. **Add environment variables** in Vercel → project → Settings → Environment Variables (all environments):
   - `ADMIN_PASSWORD` — a long, strong password for the admin page
   - `GITHUB_TOKEN` — the token from step 1
   - `GITHUB_REPO` — e.g. `yourusername/your-repo-name`
   - `GITHUB_BRANCH` — optional, defaults to `main`
3. **Redeploy** (Deployments → ⋯ → Redeploy) so the variables take effect.

Then visit `your-site.vercel.app/admin.html`, log in, edit, save.

## Security notes

- The password is checked server-side on every save; the GitHub token never leaves the server.
- Use a long random password — the admin URL is public, so the password is the lock.
- Fine-grained tokens expire (max 1 year); when saves start failing with a GitHub 401, generate a new token and update the env var.
- Replaced photos leave old files in `photos/` — harmless, but you can delete unused ones in VS Code whenever you like.

## Local development

`npx serve .` previews the site (using `content.json` from disk), but the admin's save needs the API — test that on the deployed site, or locally with `vercel dev` after `npm i -g vercel && vercel link && vercel env pull`.

## Deployment

Vercel, framework preset "Other", no build command. Push to `main` to deploy code changes.
