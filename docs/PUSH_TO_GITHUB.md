# How to Push Your NBA Milestones Project to GitHub

Your code is currently only on your local computer. Let's get it on GitHub so you can use the free daily updates!

---

## 📋 Prerequisites Check

You should have:
- ✅ Your NBA Milestones code on your computer (you do!)
- ✅ A GitHub account (you have: abenherik)
- ❓ Git installed on your computer (we'll check this)

---

## 🔍 Step 1: Check if Git is Installed

Open PowerShell and run:

```powershell
git --version
```

**If you see something like:** `git version 2.40.0`
- ✅ Great! Git is installed. Skip to Step 2.

**If you see an error:**
- ❌ Git is not installed. Download it from: https://git-scm.com/download/win
- Install it, then restart VS Code
- Come back and check again with `git --version`

---

## 🆕 Step 2: Create Repository on GitHub

### Option A: Via GitHub Website (Easiest)

1. Go to: https://github.com/new
2. Fill in the form:
   - **Repository name:** `nba-milestones` (or any name you like)
   - **Description:** "NBA Milestones Tracker - Age-based achievements"
   - **Visibility:** 
     - ✅ **Public** (recommended - required for free GitHub Actions)
     - ⚠️ Private works too, but uses your GitHub Actions minutes faster
   - **Initialize repository:**
     - ❌ DO NOT check "Add a README file"
     - ❌ DO NOT add .gitignore
     - ❌ DO NOT choose a license
     - (We already have these files locally!)

3. Click **"Create repository"**

4. You'll see a page with instructions. **Keep this page open!**

### Option B: Via GitHub CLI (Advanced)

If you have GitHub CLI installed:

```powershell
gh repo create nba-milestones --public --source=. --remote=origin
```

---

## 📤 Step 3: Initialize Git (If Not Already Done)

Open PowerShell in your project directory:

```powershell
cd "C:\Users\Markus\Backups\NBA-Milestones_20250822_123137"
```

Check if git is already initialized:

```powershell
git status
```

**If you see:** `fatal: not a git repository`

Then initialize git:

```powershell
# Initialize git
git init

# Add all files
git add .

# Create first commit
git commit -m "Initial commit: NBA Milestones Tracker with daily updates"
```

**If you see:** A list of files or "nothing to commit"
- ✅ Git is already initialized! Continue to Step 4.

---

## 🔗 Step 4: Connect to GitHub

Now connect your local code to the GitHub repository you just created.

### Get your GitHub repository URL:

From the page you kept open in Step 2, copy the URL. It looks like:
```
https://github.com/abenherik/nba-milestones.git
```

### Add the remote:

```powershell
# Add GitHub as the remote
git remote add origin https://github.com/abenherik/nba-milestones.git

# Verify it was added
git remote -v
```

You should see:
```
origin  https://github.com/abenherik/nba-milestones.git (fetch)
origin  https://github.com/abenherik/nba-milestones.git (push)
```

---

## 🚀 Step 5: Push Your Code to GitHub

Now let's push everything to GitHub:

```powershell
# Set the main branch name
git branch -M main

# Push everything to GitHub
git push -u origin main
```

**If prompted for credentials:**

GitHub no longer accepts passwords. You need a **Personal Access Token (PAT)**:

1. Go to: https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a name: "NBA Milestones Deployment"
4. Select scopes:
   - ✅ **repo** (full control of private repositories)
   - ✅ **workflow** (update GitHub Actions workflows)
5. Click "Generate token"
6. **COPY THE TOKEN** - you won't see it again!
7. Use this token as your password when Git asks

**Alternative:** Use GitHub Desktop or GitHub CLI to avoid token management.

---

## ✅ Step 6: Verify Upload

1. Go to: `https://github.com/abenherik/nba-milestones`
2. You should see all your files!
3. Check that `.github/workflows/daily-update.yml` is there

---

## 🎯 Next Steps

Now that your code is on GitHub, you can:

1. **Set up GitHub Secrets** (go back to SETUP_STEP_BY_STEP.md, Part 2)
2. **Enable GitHub Actions** (should be automatic for public repos)
3. **Test the workflow** (Actions tab → Run workflow)

---

## 🆘 Troubleshooting

### Error: "remote origin already exists"

```powershell
# Remove the old remote
git remote remove origin

# Add the new one
git remote add origin https://github.com/abenherik/nba-milestones.git
```

### Error: "failed to push some refs"

This usually means the GitHub repo has files your local doesn't have.

```powershell
# Pull first, then push
git pull origin main --allow-unrelated-histories
git push -u origin main
```

### Error: "Permission denied"

You need to authenticate. Options:
1. Use GitHub Desktop (easiest)
2. Use Personal Access Token (as password)
3. Use SSH keys (advanced)

### Still stuck?

Try using **GitHub Desktop** instead:
1. Download: https://desktop.github.com/
2. Install and sign in
3. Click "Add" → "Add existing repository"
4. Select your NBA-Milestones folder
5. Click "Publish repository"
6. Done!

---

## 📚 Resources

- **Git Basics:** https://git-scm.com/book/en/v2/Getting-Started-Git-Basics
- **GitHub Desktop:** https://desktop.github.com/
- **Personal Access Tokens:** https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token

---

Once your code is on GitHub, go back to **SETUP_STEP_BY_STEP.md Part 2** to continue with setting up the daily updates!
