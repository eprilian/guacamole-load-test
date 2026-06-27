/**
 * Guacamole Load Testing Script using Playwright
 * Simulates multiple concurrent virtual users logging in and connecting to a remote session.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
let CONFIG;
try {
  CONFIG = require('./config.json');
} catch (err) {
  console.error('\n============================================================');
  console.error('[SYSTEM] [ERROR] File "config.json" tidak ditemukan!');
  console.error('[SYSTEM] [ERROR] Harap salin "config.example.json" menjadi "config.json"');
  console.error('[SYSTEM] [ERROR] lalu konfigurasikan URL dan kredensial Anda.');
  console.error('============================================================\n');
  process.exit(1);
}


// Helper function for delays
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Format log messages with timestamp and VU identifier
function log(vuId, message, level = 'info') {
  const timestamp = new Date().toISOString();
  const vuTag = vuId !== null ? `[VU-${String(vuId).padStart(3, '0')}]` : '[SYSTEM]';
  console.log(`${timestamp} ${vuTag} ${message}`);
}

async function runVirtualUser(vuId, browser) {
  log(vuId, 'Starting session...');
  
  // Create an isolated browser context (equivalent to incognito window)
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true // Useful if testing on local/self-signed certs
  });
  
  const page = await context.newPage();
  
  try {
    // 1. Navigate to Guacamole Login Page
    log(vuId, `Navigating to ${CONFIG.url}...`);
    await page.goto(CONFIG.url, { waitUntil: 'load', timeout: 30000 });
    
    // 2. Perform Login
    log(vuId, 'Attempting login...');
    
    // Guacamole login form elements are usually inside .login-ui
    // We target generic text and password input fields within the form
    const usernameInput = page.locator('input[type="text"], input[name="username"], input[id="username"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"], input[id="password"]').first();
    
    await usernameInput.waitFor({ state: 'visible', timeout: 15000 });
    await usernameInput.fill(CONFIG.username);
    
    await passwordInput.waitFor({ state: 'visible', timeout: 5000 });
    await passwordInput.fill(CONFIG.password);
    
    // Locate the submit button (usually button[type="submit"] or containing "Login" / "Sign in")
    const loginButton = page.locator('button[type="submit"], input[type="submit"], button.login-button').first();
    await loginButton.click();
    
    log(vuId, 'Login submitted, waiting for home screen...');
    
    // 3. Wait for the Connection List / Home Screen
    // Typical Guacamole home page elements include the connection list container
    await page.waitForSelector('.connection-list, .connection, .root-group, .name', { state: 'visible', timeout: 20000 });
    log(vuId, 'Logged in successfully! Loading connection list...');
    
    // Jika hanya menguji login, diam di halaman utama hingga waktu durasi selesai
    if (CONFIG.loginOnly) {
      log(vuId, `loginOnly mode aktif. Diam di dashboard selama ${CONFIG.sessionDuration} detik...`);
      await delay(CONFIG.sessionDuration * 1000);
      return;
    }
    
    // 4. Select and Click Connection
    let connectionLocator;
    
    // Selector list that targets actual Guacamole connections without matching global links (like Cloudflare's bot challenge links)
    const targetSelector = '.connection-list .name, .connection .name, .connection-group .name, .connection, .connection-list a';
    
    if (CONFIG.connectionName) {
      log(vuId, `Searching for connection named: "${CONFIG.connectionName}"`);
      // Look for a connection containing the specific text
      connectionLocator = page.locator(targetSelector).filter({ hasText: CONFIG.connectionName }).first();
    } else {
      log(vuId, 'No connection name specified. Selecting the first available connection...');
      // Grab the first connection element link/button
      connectionLocator = page.locator(targetSelector).first();
    }
    
    await connectionLocator.waitFor({ state: 'visible', timeout: 10000 });
    const connectionText = await connectionLocator.innerText();
    log(vuId, `Clicking on connection: "${connectionText.trim()}"`);
    await connectionLocator.click();
    
    // 5. Wait for the Session to Load (WebSocket stream initialization)
    log(vuId, 'Waiting for remote session screen/canvas to load...');
    
    // Guacamole renders the desktop on a <canvas> element inside the viewport
    const displayCanvas = page.locator('canvas, .display, .guac-viewport, .viewport').first();
    await displayCanvas.waitFor({ state: 'visible', timeout: 25000 });
    log(vuId, 'Session connected! Streaming started.');
    
    // 6. Simulate Active User Behavior
    // We periodically move the mouse or send keys to prevent idle timeout and force guacd/Cloudflare to stream updates
    const endTime = Date.now() + (CONFIG.sessionDuration * 1000);
    let actionsPerformed = 0;
    
    while (Date.now() < endTime) {
      // Get the bounding box of the canvas to simulate mouse movements on it
      const box = await displayCanvas.boundingBox();
      if (box) {
        // Move mouse to a random point within the canvas
        const x = box.x + Math.floor(Math.random() * box.width);
        const y = box.y + Math.floor(Math.random() * box.height);
        
        await page.mouse.move(x, y, { steps: 5 });
        
        // Occasionally click on safe areas (e.g. center) or send a safe keystroke
        if (Math.random() > 0.7) {
          // Send key 'Shift' to keep session active without typing anything destructive
          await page.keyboard.press('Shift');
        }
      }
      
      actionsPerformed++;
      if (CONFIG.debug) {
        log(vuId, `Simulated user activity (cycles: ${actionsPerformed})`);
      }
      
      // Wait 3 to 6 seconds between interactions
      const waitTime = 3000 + Math.floor(Math.random() * 3000);
      await delay(waitTime);
    }
    
    log(vuId, `Completed target session duration of ${CONFIG.sessionDuration}s.`);
    
  } catch (error) {
    log(vuId, `Error encountered: ${error.message}`, 'error');
    // Take a screenshot if there was an error to help diagnose it
    try {
      await page.screenshot({ path: `vu-${vuId}-error.png` });
      log(vuId, `Error screenshot saved to: vu-${vuId}-error.png`);
    } catch (ssErr) {
      // Ignore screenshot errors
    }
  } finally {
    // 7. Cleanup and Close Context
    log(vuId, 'Closing connection and context...');
    await context.close();
  }
}

async function main() {
  log(null, '=== APACHE GUACAMOLE LOAD TESTER ===');
  log(null, `Target URL:       ${CONFIG.url}`);
  log(null, `Virtual Users:    ${CONFIG.concurrentUsers}`);
  log(null, `Ramp-up Delay:    ${CONFIG.rampUpDelay}s`);
  log(null, `Duration/VU:      ${CONFIG.sessionDuration}s`);
  log(null, `Headless Mode:    ${CONFIG.headless}`);
  log(null, '====================================');
  
  // Launch a single browser instance (we will open separate contexts to save RAM/CPU)
  const browser = await chromium.launch({
    headless: CONFIG.headless,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  
  const tasks = [];
  
  for (let i = 1; i <= CONFIG.concurrentUsers; i++) {
    // Stagger login attempts
    if (i > 1 && CONFIG.rampUpDelay > 0) {
      log(null, `Waiting ${CONFIG.rampUpDelay}s before starting next VU...`);
      await delay(CONFIG.rampUpDelay * 1000);
    }
    
    // Spawn the VU process asynchronously
    const task = runVirtualUser(i, browser);
    tasks.push(task);
  }
  
  // Wait for all active VUs to finish
  await Promise.all(tasks);
  
  log(null, 'All Virtual Users have finished testing. Closing browser...');
  await browser.close();
  log(null, 'Load test completed successfully!');
}

main().catch(err => {
  log(null, `Fatal test script error: ${err.message}`, 'error');
  process.exit(1);
});