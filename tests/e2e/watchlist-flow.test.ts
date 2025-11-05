import { test, expect, Page } from '@playwright/test';

// Configuration
const PRODUCTION_URL = 'https://nba-milestones-20250822-123137-21b6egkyz-abenheriks-projects.vercel.app';
const TEST_PLAYER = 'LeBron James'; // Well-known player that should exist
const TEST_PLAYER_SEARCH = 'LeBron';
const TIMEOUT_MS = 30000; // 30 second timeout for slow operations

interface TimingResults {
  searchTime: number;
  selectTime: number;
  toggleOnTime: number;
  watchlistNavigationTime: number;
  watchlistLoadTime: number;
  toggleOffTime: number;
  refreshTime: number;
}

test.describe('Watchlist Flow E2E Tests', () => {
  let timings: TimingResults;

  test.beforeEach(async ({ page }) => {
    // Initialize timing object
    timings = {
      searchTime: 0,
      selectTime: 0,
      toggleOnTime: 0,
      watchlistNavigationTime: 0,
      watchlistLoadTime: 0,
      toggleOffTime: 0,
      refreshTime: 0
    };

    // Enable console logging to capture debug info
    page.on('console', msg => {
      if (msg.text().includes('[UI]') || msg.text().includes('watchlist')) {
        console.log('Browser:', msg.text());
      }
    });

    // Navigate to production URL
    await page.goto(PRODUCTION_URL);
    await page.waitForLoadState('networkidle');
  });

  test('Complete watchlist flow with performance timing', async ({ page }) => {
    console.log('🧪 Starting watchlist flow test...');
    
    // Step 1: Navigate to Select Players
    await page.click('text=Select Players');
    await page.waitForURL('**/select-players');
    
    // Step 2: Search for player and time it
    console.log('🔍 Testing player search...');
    const searchStart = Date.now();
    await page.fill('input[placeholder="Search players..."]', TEST_PLAYER_SEARCH);
    
    // Wait for suggestions to appear
    await page.waitForSelector('ul[role="listbox"]', { timeout: TIMEOUT_MS });
    timings.searchTime = Date.now() - searchStart;
    console.log(`✅ Search completed in ${timings.searchTime}ms`);
    
    // Step 3: Select player and time it
    console.log('👤 Testing player selection...');
    const selectStart = Date.now();
    await page.click(`text=${TEST_PLAYER}`);
    
    // Wait for player to appear in selected section
    await page.waitForSelector(`text=${TEST_PLAYER}`, { timeout: TIMEOUT_MS });
    timings.selectTime = Date.now() - selectStart;
    console.log(`✅ Player selection completed in ${timings.selectTime}ms`);
    
    // Step 4: Toggle watchlist ON and time it
    console.log('⭐ Testing watchlist toggle ON...');
    const toggleOnStart = Date.now();
    const toggleButton = page.locator('button').filter({ hasText: /Toggle Watchlist|Watching/ }).first();
    await toggleButton.click();
    
    // Wait for button to show "Watching" state
    await expect(toggleButton).toHaveText('Watching', { timeout: TIMEOUT_MS });
    await expect(toggleButton).toHaveClass(/bg-blue-600/);
    timings.toggleOnTime = Date.now() - toggleOnStart;
    console.log(`✅ Toggle ON completed in ${timings.toggleOnTime}ms`);
    
    // Step 5: Navigate to Watchlist and time it
    console.log('📋 Testing watchlist navigation...');
    const navStart = Date.now();
    await page.click('text=Watchlist');
    await page.waitForURL('**/watchlist');
    
    // Step 6: Wait for player to appear in watchlist and time total load
    const loadStart = Date.now();
    await page.waitForSelector(`text=${TEST_PLAYER}`, { timeout: TIMEOUT_MS });
    timings.watchlistLoadTime = Date.now() - loadStart;
    timings.watchlistNavigationTime = Date.now() - navStart;
    console.log(`✅ Navigation completed in ${timings.watchlistNavigationTime}ms`);
    console.log(`✅ Watchlist load completed in ${timings.watchlistLoadTime}ms`);
    
    // Verify player appears with age and details
    const playerCard = page.locator(`text=${TEST_PLAYER}`).first();
    await expect(playerCard).toBeVisible();
    
    // Step 7: Toggle watchlist OFF and time it
    console.log('❌ Testing watchlist toggle OFF...');
    const toggleOffStart = Date.now();
    const removeButton = page.locator('button').filter({ hasText: /Remove|×/ }).first();
    await removeButton.click();
    
    // Wait for player to disappear from watchlist
    await expect(playerCard).not.toBeVisible({ timeout: TIMEOUT_MS });
    timings.toggleOffTime = Date.now() - toggleOffStart;
    console.log(`✅ Toggle OFF completed in ${timings.toggleOffTime}ms`);
    
    // Step 8: Refresh tab and verify player doesn't reappear
    console.log('🔄 Testing page refresh persistence...');
    const refreshStart = Date.now();
    await page.reload();
    await page.waitForLoadState('networkidle');
    timings.refreshTime = Date.now() - refreshStart;
    
    // Verify player is NOT in watchlist after refresh
    await expect(page.locator(`text=${TEST_PLAYER}`)).not.toBeVisible();
    console.log(`✅ Refresh completed in ${timings.refreshTime}ms - player correctly removed`);
    
    // Report all timings
    console.log('\n📊 Performance Report:');
    console.log(`Search Time: ${timings.searchTime}ms`);
    console.log(`Select Time: ${timings.selectTime}ms`);
    console.log(`Toggle ON Time: ${timings.toggleOnTime}ms`);
    console.log(`Navigation Time: ${timings.watchlistNavigationTime}ms`);
    console.log(`Watchlist Load Time: ${timings.watchlistLoadTime}ms`);
    console.log(`Toggle OFF Time: ${timings.toggleOffTime}ms`);
    console.log(`Refresh Time: ${timings.refreshTime}ms`);
    
    // Performance assertions
    expect(timings.searchTime).toBeLessThan(5000); // Search should be under 5s
    expect(timings.toggleOnTime).toBeLessThan(10000); // Toggle should be under 10s
    expect(timings.watchlistLoadTime).toBeLessThan(5000); // Load should be under 5s
    expect(timings.toggleOffTime).toBeLessThan(5000); // Remove should be under 5s
    
    console.log('✅ All performance benchmarks passed!');
  });

  test('Verify watchlist persistence across tabs', async ({ context }) => {
    console.log('🔄 Testing cross-tab watchlist sync...');
    
    // Create two pages (tabs)
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    
    // Navigate both to the app
    await page1.goto(`${PRODUCTION_URL}/select-players`);
    await page2.goto(`${PRODUCTION_URL}/watchlist`);
    
    // In tab 1: Add player to watchlist
    await page1.fill('input[placeholder="Search players..."]', TEST_PLAYER_SEARCH);
    await page1.waitForSelector('ul[role="listbox"]');
    await page1.click(`text=${TEST_PLAYER}`);
    
    const toggleButton = page1.locator('button').filter({ hasText: /Toggle Watchlist/ }).first();
    await toggleButton.click();
    await expect(toggleButton).toHaveText('Watching');
    
    // In tab 2: Verify player appears in watchlist
    await page2.reload();
    await page2.waitForLoadState('networkidle');
    await expect(page2.locator(`text=${TEST_PLAYER}`)).toBeVisible({ timeout: TIMEOUT_MS });
    
    // Clean up: Remove from watchlist
    const removeButton = page2.locator('button').filter({ hasText: /Remove|×/ }).first();
    await removeButton.click();
    
    console.log('✅ Cross-tab sync working correctly');
  });

  test('API error handling', async ({ page }) => {
    console.log('⚠️ Testing error handling...');
    
    // Intercept API calls and simulate errors
    await page.route('**/api/watchlist', route => {
      if (route.request().method() === 'POST') {
        route.fulfill({ status: 500, body: JSON.stringify({ error: 'Database error' }) });
      } else {
        route.continue();
      }
    });
    
    // Try to add player - should handle error gracefully
    await page.goto(`${PRODUCTION_URL}/select-players`);
    await page.fill('input[placeholder="Search players..."]', TEST_PLAYER_SEARCH);
    await page.waitForSelector('ul[role="listbox"]');
    await page.click(`text=${TEST_PLAYER}`);
    
    const toggleButton = page.locator('button').filter({ hasText: /Toggle Watchlist/ }).first();
    await toggleButton.click();
    
    // Button should revert back to "Toggle Watchlist" after error
    await expect(toggleButton).toHaveText('Toggle Watchlist', { timeout: TIMEOUT_MS });
    
    console.log('✅ Error handling working correctly');
  });
});