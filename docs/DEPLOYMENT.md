# Deployment Guide: NBA Milestones App

## Prerequisites
- Node.js 18+ installed locally
- Git repository created (recommend GitHub)
- NBA Milestones app built successfully (`npm run build`)

## Step 1: Database Setup (Turso - Recommended)

### Option A: Set up Turso (SQLite in the Cloud)
1. **Install Turso CLI:**
   ```bash
   # On Windows (via PowerShell as admin)
   iwr -useb https://turso.tech/install.ps1 | iex
   
   # Or via npm
   npm install -g @libsql/turso-cli
   ```

2. **Sign up and authenticate:**
   ```bash
   turso auth signup  # Creates account via GitHub
   turso auth login   # If you already have account
   ```

3. **Create your database:**
   ```bash
   turso db create nba-milestones
   turso db show nba-milestones
   ```

4. **Get connection details:**
   ```bash
   turso db show nba-milestones --url
   turso db tokens create nba-milestones
   ```

5. **Migrate your data:**
   ```bash
   # Export your local SQLite data
   turso db shell nba-milestones < path/to/local/schema.sql
   
   # Or copy entire database (if you have existing data)
   turso db shell nba-milestones ".read data/app.sqlite.sql"
   ```

### Environment Variables for Turso
Add these to your hosting platform:
```bash
TURSO_DATABASE_URL=libsql://your-database-url.turso.io
TURSO_AUTH_TOKEN=your-auth-token-here
NODE_ENV=production
```

## Step 2: Choose Hosting Platform

### Option 1: Vercel (Recommended for Next.js)
1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Deploy:**
   ```bash
   vercel --prod
   ```

3. **Configure environment variables in Vercel dashboard:**
   - Go to your project → Settings → Environment Variables
   - Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`

### Option 2: Railway
1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

2. **Deploy:**
   ```bash
   railway login
   railway init
   railway up
   ```

3. **Set environment variables:**
   ```bash
   railway variables set TURSO_DATABASE_URL=your-url
   railway variables set TURSO_AUTH_TOKEN=your-token
   ```

### Option 3: Netlify
1. **Build command:** `npm run build`
2. **Publish directory:** `.next`
3. **Environment variables:** Add via Netlify dashboard

## Step 3: DNS & Domain (Optional)

### Custom Domain Setup
1. **Purchase domain** (Namecheap, GoDaddy, etc.)
2. **Configure DNS:**
   - **For Vercel:** Add CNAME record pointing to `cname.vercel-dns.com`
   - **For Railway:** Add CNAME record pointing to your railway app URL
   - **For Netlify:** Add CNAME record pointing to your netlify app URL

3. **SSL Certificate:** Automatically handled by hosting platforms

## Step 4: Post-Deployment

### Verify Deployment
1. **Test API endpoints:**
   ```bash
   curl https://your-domain.com/api/health
   curl https://your-domain.com/api/players
   ```

2. **Check database connectivity:**
   - Visit your app
   - Try searching for players
   - Test watchlist functionality

### Performance Monitoring
- Enable error tracking (Sentry recommended)
- Monitor database performance via Turso dashboard
- Set up uptime monitoring (UptimeRobot, etc.)

## Environment Variables Summary

### Required for Production:
```bash
NODE_ENV=production
TURSO_DATABASE_URL=libsql://your-database-url.turso.io
TURSO_AUTH_TOKEN=your-auth-token-here
```

### Optional Performance Tuning:
```bash
NEXT_TELEMETRY_DISABLED=1
SQLITE_CACHE_KB=12000
```

## Migration from Local SQLite

### Export Data from Local Database:
```bash
# Generate SQL dump
sqlite3 data/app.sqlite .dump > export.sql

# Import to Turso
turso db shell nba-milestones < export.sql
```

### Or use the migration script:
```bash
npm run migrate:to-turso
```
(You'll need to create this script)

## Rollback Plan
If deployment fails:
1. Keep local environment running
2. Check hosting platform logs
3. Verify environment variables
4. Test database connectivity separately
5. Roll back to previous version if needed

## Support Resources
- **Turso Documentation:** https://docs.turso.tech/
- **Vercel Documentation:** https://vercel.com/docs
- **Railway Documentation:** https://docs.railway.app/
- **Next.js Deployment:** https://nextjs.org/docs/deployment