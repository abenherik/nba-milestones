# Complete Setup Guide: Free Daily NBA Stats Updates

**Time Required:** 10 minutes  
**Cost:** $0 (completely free!)  
**Difficulty:** Easy - just copy and paste

---

## 📋 What You're Setting Up

Your app will automatically fetch the latest NBA game stats every day at 6:00 AM UTC without you doing anything. It's like having a robot assistant that updates your database while you sleep! 🤖

---

## ✅ Before You Start - Checklist

Make sure you have:
- [ ] A GitHub account (where your code is stored)
- [ ] Your code pushed to GitHub repository
  - ⚠️ **Don't have this yet?** See [PUSH_TO_GITHUB.md](PUSH_TO_GITHUB.md) first!
- [ ] A Vercel account with your app deployed
- [ ] 10 minutes of time

> 🚨 **IMPORTANT:** If you don't see your NBA Milestones repository on GitHub yet, **STOP HERE** and follow [PUSH_TO_GITHUB.md](PUSH_TO_GITHUB.md) first. You need your code on GitHub before you can set up daily updates!

---

## 🔑 PART 1: Generate Your Secret Password

This is a special password that only GitHub and your app will know.

### Windows (PowerShell):

1. Press `Windows Key + X`
2. Click "Windows PowerShell" or "Terminal"
3. Copy and paste this command:

```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
```

4. Press `Enter`
5. You'll see something like: `a3f9k2mB7nQ4pR8sT1vY6wZ0xC5dE9h`
6. **COPY THIS** - you'll need it in the next steps
7. **IMPORTANT:** Keep this secret! Don't share it publicly.

### Mac/Linux (Terminal):

1. Open Terminal
2. Copy and paste this command:

```bash
openssl rand -hex 32
```

3. Press `Enter`
4. You'll see something like: `a3f9k2m7b4e8f1c9d6a2b5e3f7c8d9e1a4b6c8d2e5f7a3b9c1d4e6f8a2b5c7d9`
5. **COPY THIS** - you'll need it in the next steps

> 💡 **Tip:** Open Notepad and paste this secret there so you don't lose it!

---

## 🐙 PART 2: Add Secrets to GitHub

Now we'll tell GitHub your secret password so it can update your app.

### Step 1: Go to Your Repository

1. Open your web browser
2. Go to `https://github.com`
3. Sign in if needed
4. Click on your repository (the one with your NBA Milestones code)

### Step 2: Go to Settings

1. Click the **"Settings"** tab (top of the page, near "Code" and "Issues")
2. Look on the left sidebar
3. Click **"Secrets and variables"** 
4. Click **"Actions"** (it will expand)

You should now see a page that says "Actions secrets and variables"

### Step 3: Add First Secret (CRON_SECRET)

1. Click the green **"New repository secret"** button
2. In the **"Name"** field, type exactly: `CRON_SECRET`
3. In the **"Secret"** field, paste the password you generated in Part 1
4. Click **"Add secret"**

✅ You should see "CRON_SECRET" in the list now!

### Step 4: Add Second Secret (VERCEL_APP_URL)

1. Click **"New repository secret"** again
2. In the **"Name"** field, type exactly: `VERCEL_APP_URL`
3. In the **"Secret"** field, type your Vercel app URL

   **How to find your Vercel URL:**
   - Go to https://vercel.com
   - Click on your project
   - Look for the URL like: `https://nba-milestones-abc123.vercel.app`
   - Copy it **WITHOUT** the trailing slash (no `/` at the end)
   
   ✅ Good: `https://nba-milestones-abc123.vercel.app`  
   ❌ Bad: `https://nba-milestones-abc123.vercel.app/`

4. Click **"Add secret"**

✅ You should now see TWO secrets: `CRON_SECRET` and `VERCEL_APP_URL`

---

## ☁️ PART 3: Add Secret to Vercel

Now we need to tell your Vercel app the same secret password.

### Step 1: Go to Vercel Dashboard

1. Open your web browser
2. Go to `https://vercel.com`
3. Sign in if needed
4. Click on your **NBA Milestones** project

### Step 2: Go to Settings

1. Click the **"Settings"** tab (top navigation)
2. Click **"Environment Variables"** in the left sidebar

### Step 3: Add the Secret

1. You'll see a form with three fields
2. In **"Key"** field, type exactly: `CRON_SECRET`
3. In **"Value"** field, paste the SAME password from Part 1 (the one you used in GitHub)
   - ⚠️ **CRITICAL:** This MUST be the exact same value as GitHub!
4. In **"Environments"** section, check ALL three boxes:
   - ✅ Production
   - ✅ Preview
   - ✅ Development
5. Click **"Save"**

✅ You should see `CRON_SECRET` in the list of environment variables!

---

## 🚀 PART 4: Push the Code to GitHub

Now we'll activate the automatic update system.

### If you're using VS Code:

1. Open VS Code with your project
2. Look at the left sidebar for the "Source Control" icon (looks like a branch)
3. You should see changed files including:
   - `.github/workflows/daily-update.yml`
   - `vercel.json`
   - Other documentation files
4. At the top, there's a message box - type: `Add free daily updates via GitHub Actions`
5. Click the **"Commit"** button (checkmark icon)
6. Click the **"Sync Changes"** or **"Push"** button

### If you're using Terminal/Command Line:

```bash
# Make sure you're in your project directory
cd path/to/your/project

# Add all the new files
git add .

# Commit with a message
git commit -m "Add free daily updates via GitHub Actions"

# Push to GitHub
git push
```

### If you're using GitHub Desktop:

1. Open GitHub Desktop
2. You should see the changed files
3. At the bottom left, type: `Add free daily updates via GitHub Actions`
4. Click **"Commit to main"** (or your branch name)
5. Click **"Push origin"** at the top

✅ The code is now on GitHub!

---

## 🧪 PART 5: Test That It Works

Let's make sure everything is set up correctly!

### Option A: Test via GitHub Actions UI (Recommended)

1. Go to your repository on GitHub
2. Click the **"Actions"** tab (between "Pull requests" and "Projects")
3. On the left, you should see: **"Daily Active Player Stats Update"**
4. Click on it
5. On the right side, click the **"Run workflow"** dropdown button
6. Click the green **"Run workflow"** button in the dropdown
7. Wait 5-10 seconds, then refresh the page
8. You should see a yellow circle (running) or green checkmark (completed)
9. Click on the workflow run to see details
10. Click on the job name to see logs

**What you should see:**
- Green checkmarks ✅
- A message like: "✅ Update completed successfully!"
- JSON output with stats like `"playersProcessed": 450, "gamesAdded": 15`

**If you see red X:**
- Click on the failed step to see error details
- Most common issue: Secrets don't match between GitHub and Vercel
- Go back to Parts 2 and 3 and double-check your `CRON_SECRET` values

### Option B: Test via Command Line

Open Terminal/PowerShell and run:

```bash
curl -X POST https://YOUR-APP-URL.vercel.app/api/cron/update-active-players \
  -H "Authorization: Bearer YOUR_CRON_SECRET_HERE"
```

Replace:
- `YOUR-APP-URL.vercel.app` with your actual Vercel URL
- `YOUR_CRON_SECRET_HERE` with your secret from Part 1

**Windows PowerShell version:**
```powershell
Invoke-WebRequest -Uri "https://YOUR-APP-URL.vercel.app/api/cron/update-active-players" -Method POST -Headers @{"Authorization"="Bearer YOUR_CRON_SECRET_HERE"}
```

**What you should see:**
```json
{
  "success": true,
  "season": "2024-25",
  "playersProcessed": 450,
  "gamesAdded": 15,
  "gamesSkipped": 5432,
  "errors": 0,
  "duration": 45230
}
```

---

## 📊 PART 6: Verify Data Is Updating

Let's check that your database actually got updated!

1. Open your browser
2. Go to: `https://YOUR-APP-URL.vercel.app/api/debug`
3. You should see information about your database
4. Look for `gameCount` - this should be a number greater than 0
5. Look for recent dates in the sample data

✅ If you see game data with recent dates, it worked!

---

## 🎯 What Happens Now?

### Automatic Updates:

- **Every day at 6:00 AM UTC**, GitHub Actions will automatically run
- It will fetch the latest games for all active players
- Your database will be updated with new data
- You don't need to do anything!

### To Check When It Ran:

1. Go to GitHub → Your repo → Actions tab
2. You'll see a list of all runs
3. Each day at 6 AM UTC, there will be a new entry
4. Green checkmark = success ✅
5. Red X = something failed ❌

### Email Notifications (Optional):

GitHub can email you if something fails:

1. Go to `https://github.com/settings/notifications`
2. Scroll to "Actions"
3. Check "Send notifications for failed workflows"

---

## 🔧 Troubleshooting Common Issues

### Error: "401 Unauthorized"

**Problem:** The secrets don't match between GitHub and Vercel

**Fix:**
1. Generate a NEW secret (go back to Part 1)
2. Update BOTH GitHub secret AND Vercel environment variable with the new value
3. Make sure they are EXACTLY the same (no extra spaces!)

### Error: "Workflow not found"

**Problem:** The workflow file didn't get pushed to GitHub

**Fix:**
1. Make sure `.github/workflows/daily-update.yml` exists in your project
2. Push the code again (Part 4)
3. Check on GitHub that the file exists in your repository

### Error: "No active players to update"

**Problem:** Your database doesn't have any players marked as active

**Fix:**
1. Go to your app's `/api/debug` endpoint
2. Check if `playerCount` is 0
3. You may need to seed your database first
4. Visit your app's `/seed` endpoint to add sample data

### Workflow runs but no data appears

**Problem:** The endpoint is being called but not updating the database

**Fix:**
1. Check the Vercel function logs:
   - Go to Vercel → Your project → Logs
   - Filter by the update endpoint
   - Look for errors
2. Make sure `CRON_SECRET` is set in Vercel (Part 3)
3. Check that your Turso database is accessible

### "This workflow has been disabled"

**Problem:** GitHub disables workflows on inactive repos after 60 days

**Fix:**
1. Go to Actions tab
2. Click "Enable workflow"
3. Or make any commit to your repo to re-enable it

---

## 📅 When Does It Run?

The update runs **every day at 6:00 AM UTC**.

To see what time that is for you:

- **EST (New York):** 1:00 AM or 2:00 AM (depending on DST)
- **PST (Los Angeles):** 10:00 PM or 11:00 PM previous day
- **CET (Europe):** 7:00 AM or 8:00 AM
- **JST (Japan):** 3:00 PM

This time was chosen because most NBA games finish by then!

---

## 🎉 You're Done!

Congratulations! Your app now automatically updates every day! 🚀

### What you accomplished:

✅ Set up free GitHub Actions automation  
✅ Configured secure authentication  
✅ Tested that it works  
✅ Verified data is updating  

### Your app now:

- 📊 Automatically fetches latest NBA games
- 🔄 Updates the database daily
- 💰 Costs $0/month
- 🤖 Runs without you doing anything

---

## 📞 Need Help?

If something isn't working:

1. **Check the logs:** GitHub Actions → Click on a run → View details
2. **Check Vercel logs:** Vercel dashboard → Your project → Logs
3. **Review this guide:** Make sure you followed each step exactly
4. **Check common issues:** See Troubleshooting section above

---

## 📚 Additional Resources

- **Quick Setup:** `docs/QUICK_SETUP.md` - Shorter version
- **Detailed Docs:** `docs/DAILY_UPDATES.md` - Technical details
- **GitHub Actions Docs:** https://docs.github.com/en/actions

---

**Last Updated:** November 5, 2025  
**System Status:** ✅ Fully operational and free!
