# Daily Updates Setup - Checklist ✅

Use this checklist to track your progress. Check off each step as you complete it!

---

## 🔑 Part 1: Generate Secret Password

- [ ] Opened PowerShell/Terminal
- [ ] Ran the command to generate random secret
- [ ] Copied the secret to Notepad/safe place
- [ ] **Secret saved:** `________________________` (write it down!)

---

## 🐙 Part 2: GitHub Secrets (2 secrets needed)

### Secret #1: CRON_SECRET
- [ ] Went to GitHub repo → Settings → Secrets and variables → Actions
- [ ] Clicked "New repository secret"
- [ ] Name: `CRON_SECRET` (exactly like this)
- [ ] Pasted the secret from Part 1
- [ ] Clicked "Add secret"
- [ ] ✅ See `CRON_SECRET` in the secrets list

### Secret #2: VERCEL_APP_URL
- [ ] Clicked "New repository secret" again
- [ ] Name: `VERCEL_APP_URL` (exactly like this)
- [ ] Pasted Vercel URL (NO trailing slash!)
- [ ] Clicked "Add secret"
- [ ] ✅ See both `CRON_SECRET` and `VERCEL_APP_URL` in list

**My Vercel URL:** `________________________`

---

## ☁️ Part 3: Vercel Environment Variable

- [ ] Went to Vercel → Project → Settings → Environment Variables
- [ ] Found the "Add New" section
- [ ] Key: `CRON_SECRET` (exactly like this)
- [ ] Value: Same secret from Part 1 (MUST MATCH GitHub!)
- [ ] Checked all 3 boxes: Production, Preview, Development
- [ ] Clicked "Save"
- [ ] ✅ See `CRON_SECRET` in the environment variables list

---

## 🚀 Part 4: Push Code to GitHub

Choose your method:

### VS Code:
- [ ] Opened Source Control panel
- [ ] Saw changed files listed
- [ ] Typed commit message: "Add free daily updates via GitHub Actions"
- [ ] Clicked Commit button
- [ ] Clicked Sync/Push button
- [ ] ✅ Changes pushed to GitHub

### Terminal:
- [ ] Ran: `git add .`
- [ ] Ran: `git commit -m "Add free daily updates via GitHub Actions"`
- [ ] Ran: `git push`
- [ ] ✅ Saw success message

### GitHub Desktop:
- [ ] Saw changed files
- [ ] Typed commit message
- [ ] Clicked "Commit to main"
- [ ] Clicked "Push origin"
- [ ] ✅ Changes pushed

---

## 🧪 Part 5: Test It Works

### Method A: GitHub Actions UI (Recommended)
- [ ] Went to GitHub repo → Actions tab
- [ ] Saw "Daily Active Player Stats Update" on the left
- [ ] Clicked on it
- [ ] Clicked "Run workflow" → "Run workflow"
- [ ] Waited and refreshed page
- [ ] ✅ Saw green checkmark (success!)
- [ ] Clicked on run to see details
- [ ] ✅ Saw "Update completed successfully!"

### Method B: Command Line (Alternative)
- [ ] Opened Terminal/PowerShell
- [ ] Ran curl command with my URL and secret
- [ ] ✅ Got JSON response with `"success": true`

---

## 📊 Part 6: Verify Database Updated

- [ ] Opened browser
- [ ] Went to: `https://MY-APP.vercel.app/api/debug`
- [ ] ✅ Saw `gameCount` greater than 0
- [ ] ✅ Saw recent game dates in sample data

---

## 🎯 Final Verification

- [ ] GitHub Actions runs without errors
- [ ] Database shows updated data
- [ ] No red X's in GitHub Actions
- [ ] Received test notification (if enabled)

---

## 📅 Future Monitoring

Set reminders to check:

- [ ] **Weekly:** Check GitHub Actions tab for green checkmarks
- [ ] **Monthly:** Verify data is up to date on your app
- [ ] **As needed:** Enable email notifications for failures

---

## ✅ Setup Complete!

If all boxes are checked, you're done! 🎉

**Setup completed on:** _____________ (date)

**Next automatic run:** Tomorrow at 6:00 AM UTC

**Status:** 
- [ ] ✅ Everything working perfectly
- [ ] ⚠️ Needs troubleshooting (see SETUP_STEP_BY_STEP.md)

---

## 🆘 If Something Failed

Go to: `docs/SETUP_STEP_BY_STEP.md` → "Troubleshooting" section

Common issues:
1. 401 error → Secrets don't match (recheck Part 2 & 3)
2. Workflow not found → Code not pushed (redo Part 4)
3. No data → Database empty (visit /seed endpoint)

---

## 📁 Documentation Files

- `SETUP_STEP_BY_STEP.md` - Full detailed guide (you are here!)
- `QUICK_SETUP.md` - Shorter version for experienced users
- `DAILY_UPDATES.md` - Technical details and API reference

---

**Need help?** Check the troubleshooting section in SETUP_STEP_BY_STEP.md
