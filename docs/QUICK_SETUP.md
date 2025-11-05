# Quick Setup: Daily Updates (GitHub Actions - FREE)

This is a quick reference for setting up the free daily update system using GitHub Actions.

## What You Need

- GitHub repository with Actions enabled
- Vercel app deployed
- 5 minutes to configure

## Step-by-Step Setup

### 1. Generate Secret Token

**On Mac/Linux:**
```bash
openssl rand -hex 32
```

**On Windows PowerShell:**
```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
```

Copy the generated string - you'll use it in both places below.

### 2. Add GitHub Secrets

1. Go to: `https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions`
2. Click **New repository secret**
3. Add these two secrets:

   **CRON_SECRET**
   - Name: `CRON_SECRET`
   - Value: [paste the token you generated above]

   **VERCEL_APP_URL**
   - Name: `VERCEL_APP_URL`  
   - Value: `https://your-app.vercel.app` (NO trailing slash!)

### 3. Add Vercel Environment Variable

1. Go to: Vercel Dashboard → Your Project → Settings → Environment Variables
2. Click **Add New**
3. Add:
   - Name: `CRON_SECRET`
   - Value: [paste the SAME token from step 1]
   - Environments: ✅ Production ✅ Preview ✅ Development

### 4. Deploy the Workflow

```bash
# Make sure you have the workflow file
ls .github/workflows/daily-update.yml

# Push to GitHub
git add .github/workflows/daily-update.yml
git add vercel.json  # Updated config (removed Vercel cron)
git commit -m "Add daily update workflow via GitHub Actions"
git push
```

### 5. Verify It Works

**Option A: Wait for automatic run**
- First run: Tomorrow at 6:00 AM UTC
- Check: GitHub → Actions tab

**Option B: Test immediately**
1. Go to: GitHub → Actions tab
2. Click: **Daily Active Player Stats Update**
3. Click: **Run workflow** → **Run workflow**
4. Wait ~2-5 minutes
5. Click on the run to see logs

**Option C: Test via curl**
```bash
curl -X POST https://your-app.vercel.app/api/cron/update-active-players \
  -H "Authorization: Bearer YOUR_CRON_SECRET_HERE"
```

## Expected Result

You should see output like:
```json
{
  "success": true,
  "season": "2024-25",
  "playersProcessed": 450,
  "gamesAdded": 15,
  "gamesSkipped": 1234,
  "errors": 0,
  "duration": 45230
}
```

## Troubleshooting

### "401 Unauthorized"
- ❌ Secrets don't match between GitHub and Vercel
- ✅ Generate a new token and update BOTH places with the SAME value

### "Workflow not found"
- ❌ File not pushed to GitHub
- ✅ Make sure `.github/workflows/daily-update.yml` exists in your repo

### "No active players"
- ❌ Database doesn't have any players with `is_active = 1`
- ✅ Check your database at `/api/debug`

### "Timeout"
- ❌ Too many active players or slow API
- ✅ This is rare - the endpoint has 5 minutes which is plenty

## What Happens Daily

1. **6:00 AM UTC**: GitHub Actions triggers automatically
2. **API Call**: Sends authenticated POST to your Vercel endpoint
3. **Fetch Data**: Gets latest games for all active players from NBA API
4. **Update DB**: Adds new games to Turso database
5. **Done**: Your app now has latest data!

## Monitoring

- **GitHub Actions logs**: See detailed execution logs
- **Email notifications**: GitHub sends alerts on failures
- **Database check**: Visit `/api/debug` to verify data

## Cost

**$0/month** 🎉

- GitHub Actions: 2,000 free minutes/month (uses ~2-5 minutes/day = ~150 minutes/month)
- Vercel Hobby: Free tier includes serverless functions
- No credit card required!

## Next Steps

Once working:
- Enable GitHub Actions email notifications for failures
- Check the logs after first few runs
- Verify data is updating in your app
- You're done! ✅

---

For detailed documentation, see: [docs/DAILY_UPDATES.md](../DAILY_UPDATES.md)
