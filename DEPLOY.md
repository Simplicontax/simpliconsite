# Deploy US Taxfiler Website

Your site is built and ready to deploy. Choose one of these free hosting options:

## Option 1: Netlify Drop (Easiest - No CLI needed)

1. Run `npm run build` (already done)
2. Go to **[netlify.com/drop](https://app.netlify.com/drop)**
3. Drag and drop the **`dist`** folder onto the page
4. Your site will be live in seconds with a URL like `random-name.netlify.app`
5. (Optional) Add a custom domain in Netlify settings

## Option 2: Vercel

1. Install Vercel: `npm i -g vercel`
2. Run: `npx vercel` (or `npm run deploy`)
3. Follow prompts to log in (create free account at vercel.com)
4. Your site deploys with a URL like `ustaxfiler.vercel.app`

## Option 3: Netlify CLI

1. Install: `npm i -g netlify-cli`
2. Run: `npm run deploy:netlify`
3. Log in when prompted
4. Site deploys to Netlify

## Option 4: GitHub Pages

1. Push this project to a GitHub repository
2. Go to repo **Settings → Pages**
3. Source: **Deploy from a branch**
4. Branch: `main`, folder: `/ (root)` - but you need to deploy the `dist` folder
5. Use GitHub Actions or set the build output to `dist`

## Local Preview

To preview the built site locally:
```bash
npm run preview
```
Then open http://localhost:4173
