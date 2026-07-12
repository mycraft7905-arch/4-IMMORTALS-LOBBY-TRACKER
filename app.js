// State variables
let matches = [];
let adminPIN = '0852';
let isAdmin = false;
let currentCurrency = '₹';
let activeFilterTab = 'all';
let searchText = '';
let tempPinInput = '';
let currentEditId = null;

// Firebase Cloud Sync Configuration
const DEFAULT_FIREBASE_DB_URL = "https://scrim-management-default-rtdb.asia-southeast1.firebasedatabase.app/";
let firebaseApp = null;
let dbRef = null;

// Initial Date Helper (Format current local time as YYYY-MM-DD for forms)
const getTodayString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Toast Notifications System
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';

  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  // Remove toast after animation finishes (3.5s display)
  setTimeout(() => {
    toast.style.animation = 'toast-in 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28) reverse forwards';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3500);
}

// Format Currency Utility
function formatMoney(amount) {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount).toFixed(2);
  return `${isNegative ? '-' : ''}${currentCurrency}${absAmount}`;
}

// ---------------- APP INITIALIZATION ----------------
document.addEventListener('DOMContentLoaded', () => {
  // Load configuration from LocalStorage
  if (localStorage.getItem('lobby_tracker_pin')) {
    adminPIN = localStorage.getItem('lobby_tracker_pin');
    if (adminPIN === '1234') {
      adminPIN = '0852';
      localStorage.setItem('lobby_tracker_pin', '0852');
    }
  } else {
    localStorage.setItem('lobby_tracker_pin', adminPIN);
  }

  if (localStorage.getItem('lobby_tracker_currency')) {
    currentCurrency = localStorage.getItem('lobby_tracker_currency');
    document.getElementById('currencySelect').value = currentCurrency;
  }

  // Load cache from localStorage for quick loading/offline use
  if (localStorage.getItem('lobby_tracker_matches')) {
    try {
      matches = JSON.parse(localStorage.getItem('lobby_tracker_matches'));
    } catch (e) {
      console.error("Failed to parse matches data:", e);
      matches = [];
    }
  }

  // Update dates, dynamic labels
  updateCurrentTimeBadge();
  setInterval(updateCurrentTimeBadge, 60000); // Update time every minute
  
  // Set default values in input fields
  document.getElementById('lobbyDate').value = getTodayString();
  updateCurrencyLabelElements();

  // Initial UI Render of cached matches
  renderDashboard();
  
  // Initialize Firebase Cloud database connection
  initFirebase();

  // Initialize Lucide Icons
  lucide.createIcons();
});

// Firebase Initialization & Listeners
function initFirebase() {
  const dbUrl = localStorage.getItem('lobby_tracker_firebase_url') || DEFAULT_FIREBASE_DB_URL;
  
  // Populate settings input field
  const dbInput = document.getElementById('firebaseDbInput');
  if (dbInput) {
    dbInput.value = localStorage.getItem('lobby_tracker_firebase_url') || '';
    dbInput.placeholder = DEFAULT_FIREBASE_DB_URL;
  }

  // If already initialized, delete app before re-init to switch databases
  if (firebaseApp) {
    try {
      firebaseApp.delete();
    } catch (e) {
      console.error("Error deleting old firebase app instance:", e);
    }
  }

  setSyncStatus('syncing', 'Connecting to Cloud...');

  try {
    firebaseApp = firebase.initializeApp({
      databaseURL: dbUrl
    }, 'LobbyTrackerApp_' + Date.now());

    const database = firebase.database(firebaseApp);
    dbRef = database.ref();

    // Connection state observer
    database.ref('.info/connected').on('value', (snap) => {
      if (snap.val() === true) {
        setSyncStatus('online', 'Cloud Sync Online');
      } else {
        setSyncStatus('offline', 'Cloud Sync Offline');
      }
    });

    // Sync admin security PIN
    dbRef.child('adminPIN').on('value', (snap) => {
      const cloudPin = snap.val();
      if (cloudPin && cloudPin.length === 4) {
        adminPIN = cloudPin;
        localStorage.setItem('lobby_tracker_pin', adminPIN);
      } else {
        // Set PIN on database if empty
        dbRef.child('adminPIN').set(adminPIN);
      }
    });

    // Sync matches array in real-time
    dbRef.child('matches').on('value', (snap) => {
      const cloudMatches = snap.val();
      matches = cloudMatches || [];
      localStorage.setItem('lobby_tracker_matches', JSON.stringify(matches));
      renderDashboard();
    }, (error) => {
      console.error("Firebase read failure:", error);
      setSyncStatus('offline', 'Cloud Read Error');
      showToast('Database read failed. Verify configuration.', 'error');
    });

  } catch (err) {
    console.error("Firebase init failed:", err);
    setSyncStatus('offline', 'Cloud Connection Error');
    showToast('Database connection failed.', 'error');
  }
}

// Sync Status Indicator update helper
function setSyncStatus(status, text) {
  const indicator = document.getElementById('syncStatusIndicator');
  const statusText = document.getElementById('syncStatusText');
  if (!indicator || !statusText) return;

  statusText.textContent = text;
  indicator.className = 'status-indicator'; // Reset class list

  if (status === 'online') {
    indicator.classList.add('online');
  } else if (status === 'offline') {
    indicator.classList.add('offline');
  } else if (status === 'syncing') {
    indicator.classList.add('syncing');
  }
}

// Save firebase settings and reconnect
function updateFirebaseSettings(url) {
  if (!isAdmin) return;
  
  const cleanUrl = url.trim();
  if (cleanUrl === '') {
    localStorage.removeItem('lobby_tracker_firebase_url');
    showToast('Resetting Firebase URL to default.', 'info');
  } else {
    // Add trailing slash if missing for Firebase
    const formattedUrl = cleanUrl.endsWith('/') ? cleanUrl : cleanUrl + '/';
    localStorage.setItem('lobby_tracker_firebase_url', formattedUrl);
    showToast('Firebase settings updated.', 'success');
  }
  
  initFirebase();
}

// Update the clock in the header
function updateCurrentTimeBadge() {
  const now = new Date();
  const dateOptions = { month: 'long', day: 'numeric', year: 'numeric' };
  const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
  
  const formattedDate = now.toLocaleDateString('en-US', dateOptions);
  const formattedTime = now.toLocaleTimeString('en-US', timeOptions);
  
  const displayEl = document.getElementById('dateTimeDisplay');
  if (displayEl) {
    displayEl.innerHTML = `
      <span class="date">${formattedDate}</span>
      <span class="time-badge">${formattedTime}</span>
    `;
  }
}

// Update prefix currency labels dynamically
function updateCurrencyLabelElements() {
  document.querySelectorAll('.currency-symbol').forEach(el => {
    el.textContent = currentCurrency;
  });
}

// ---------------- CORE DATA & RENDERING ----------------

function renderDashboard() {
  updateDashboardStats();
  renderLobbyList();
  renderChart();
}

function updateDashboardStats() {
  let totalNet = 0;
  let winsCount = 0;
  let totalSpent = 0;
  let totalEarnings = 0;
  
  matches.forEach(m => {
    const buyIn = parseFloat(m.price) || 0;
    totalSpent += buyIn;
    
    if (m.outcome === 'win') {
      winsCount++;
      const won = parseFloat(m.wonAmount) || 0;
      totalEarnings += won;
      totalNet += (won - buyIn);
    } else {
      const lost = parseFloat(m.lostAmount) || 0;
      totalNet -= lost;
    }
  });

  const totalPlayed = matches.length;
  const winPercent = totalPlayed > 0 ? Math.round((winsCount / totalPlayed) * 100) : 0;
  
  // Update HTML elements
  const totalProfitEl = document.getElementById('totalProfit');
  totalProfitEl.textContent = formatMoney(totalNet);
  
  // Add styling color based on profit
  const statProfitCard = document.getElementById('statProfitCard');
  const trendEl = document.getElementById('profitTrend');
  const trendTextEl = document.getElementById('profitTrendText');
  
  if (totalPlayed === 0) {
    statProfitCard.className = 'stat-card glass-card profit-card';
    trendEl.className = 'stat-trend trend-neutral';
    trendTextEl.innerHTML = 'No matches logged';
    trendEl.innerHTML = `<i data-lucide="minus"></i> <span id="profitTrendText">No matches logged</span>`;
  } else if (totalNet > 0) {
    statProfitCard.className = 'stat-card glass-card profit-card positive-glow';
    trendEl.className = 'stat-trend trend-positive';
    trendEl.innerHTML = `<i data-lucide="trending-up"></i> <span id="profitTrendText">Net Gain</span>`;
  } else if (totalNet < 0) {
    statProfitCard.className = 'stat-card glass-card profit-card negative-glow';
    trendEl.className = 'stat-trend trend-negative';
    trendEl.innerHTML = `<i data-lucide="trending-down"></i> <span id="profitTrendText">Net Deficit</span>`;
  } else {
    statProfitCard.className = 'stat-card glass-card profit-card';
    trendEl.className = 'stat-trend trend-neutral';
    trendEl.innerHTML = `<i data-lucide="minus"></i> <span id="profitTrendText">Breaking Even</span>`;
  }

  // Win Rate
  document.getElementById('winRate').textContent = `${winPercent}%`;
  document.getElementById('winLossRatio').textContent = `${winsCount} Wins / ${totalPlayed - winsCount} Losses`;
  
  // SVG progress ring calculations (r=24, perimeter ≈ 150.79)
  const ringFill = document.getElementById('winRateRing');
  const circumference = 2 * Math.PI * 24; // ≈ 150.796
  const offset = circumference - (winPercent / 100) * circumference;
  ringFill.style.strokeDasharray = `${circumference} ${circumference}`;
  ringFill.style.strokeDashoffset = offset;

  // Lobbies Count
  document.getElementById('totalLobbies').textContent = totalPlayed;
  const lastPlayedText = document.getElementById('lastPlayedText');
  if (totalPlayed > 0) {
    // Sort and get the latest match date
    const sorted = [...matches].sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));
    const latest = sorted[0];
    lastPlayedText.textContent = `Last: ${formatDateLabel(latest.date)} at ${latest.time}`;
  } else {
    lastPlayedText.textContent = 'No sessions tracked yet';
  }

  // Volume Earning / Spent
  document.getElementById('totalEarnings').textContent = formatMoney(totalEarnings);
  document.getElementById('totalBuyins').textContent = formatMoney(totalSpent);
  
  lucide.createIcons();
}

function renderLobbyList() {
  const listContainer = document.getElementById('lobbyList');
  const emptyState = document.getElementById('emptyListState');
  listContainer.innerHTML = '';
  
  // Sort matches by date and time (newest first in list)
  let filtered = [...matches].sort((a, b) => {
    const dateTimeA = new Date(`${a.date} ${convertTo24Hour(a.time)}`);
    const dateTimeB = new Date(`${b.date} ${convertTo24Hour(b.time)}`);
    return dateTimeB - dateTimeA;
  });

  // Apply tab filters
  if (activeFilterTab === 'win') {
    filtered = filtered.filter(m => m.outcome === 'win');
  } else if (activeFilterTab === 'loss') {
    filtered = filtered.filter(m => m.outcome === 'loss');
  }

  // Apply search filtering
  if (searchText.trim() !== '') {
    const query = searchText.toLowerCase();
    filtered = filtered.filter(m => {
      const formattedDateStr = formatDateLabel(m.date).toLowerCase();
      return m.date.includes(query) || 
             m.time.toLowerCase().includes(query) || 
             formattedDateStr.includes(query) ||
             (m.price.toString().includes(query)) ||
             (m.outcome.includes(query));
    });
  }

  if (filtered.length === 0) {
    emptyState.style.display = 'flex';
    listContainer.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  listContainer.style.display = 'flex';

  filtered.forEach(m => {
    const isWin = m.outcome === 'win';
    
    // Net profit for this match
    const buyIn = parseFloat(m.price) || 0;
    let netAmount = 0;
    let grossText = '';
    
    if (isWin) {
      const won = parseFloat(m.wonAmount) || 0;
      netAmount = won - buyIn;
      grossText = `Earned: ${formatMoney(won)}`;
    } else {
      const lost = parseFloat(m.lostAmount) || 0;
      netAmount = -lost;
      grossText = `Lost Buy-in`;
    }

    const card = document.createElement('div');
    card.className = `lobby-card`;
    card.dataset.id = m.id;

    // Date calculations
    const dateObj = new Date(m.date + 'T00:00:00');
    const day = dateObj.getDate();
    const monthStr = dateObj.toLocaleDateString('en-US', { month: 'short' });

    card.innerHTML = `
      <div class="lobby-card-left">
        <div class="lobby-date-badge">
          <span class="day">${day}</span>
          <span class="month">${monthStr}</span>
        </div>
        <div class="lobby-meta">
          <div class="lobby-time-tag">
            <i data-lucide="clock"></i>
            <span>${m.time}</span>
          </div>
          <div>
            <span class="outcome-badge ${isWin ? 'badge-win' : 'badge-loss'}">
              <i data-lucide="${isWin ? 'trophy' : 'skull'}"></i>
              ${isWin ? 'Win' : 'Loss'}
            </span>
          </div>
        </div>
      </div>

      <div class="lobby-card-right">
        <div class="lobby-pricing">
          <span class="lobby-net-profit ${netAmount >= 0 ? 'profit-text' : 'loss-text'}">
            ${netAmount >= 0 ? '+' : ''}${formatMoney(netAmount)}
          </span>
          <span class="lobby-gross">Buy-in: ${formatMoney(buyIn)} • ${grossText}</span>
        </div>

        <div class="lobby-actions">
          <button class="action-btn edit-btn" onclick="openEditLobbyModal('${m.id}')" title="Edit Lobby">
            <i data-lucide="edit-3"></i>
          </button>
          <button class="action-btn delete-btn" onclick="deleteLobby('${m.id}')" title="Delete Lobby">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `;

    listContainer.appendChild(card);
  });

  lucide.createIcons();
}

// ---------------- SVG GRAPHING CHART ----------------

function renderChart() {
  const chartSvg = document.getElementById('trendChart');
  const chartPlaceholder = document.getElementById('chartPlaceholder');
  
  if (matches.length < 2) {
    chartSvg.style.display = 'none';
    chartPlaceholder.style.display = 'flex';
    return;
  }

  chartSvg.style.display = 'block';
  chartPlaceholder.style.display = 'none';
  
  // Sort matches chronologically (oldest to newest for plotting graph)
  const sortedMatches = [...matches].sort((a, b) => {
    const dateTimeA = new Date(`${a.date} ${convertTo24Hour(a.time)}`);
    const dateTimeB = new Date(`${b.date} ${convertTo24Hour(b.time)}`);
    return dateTimeA - dateTimeB;
  });

  // Calculate cumulative profit points
  let cumulativeProfit = 0;
  const dataPoints = sortedMatches.map((m, idx) => {
    const buyIn = parseFloat(m.price) || 0;
    if (m.outcome === 'win') {
      const won = parseFloat(m.wonAmount) || 0;
      cumulativeProfit += (won - buyIn);
    } else {
      const lost = parseFloat(m.lostAmount) || 0;
      cumulativeProfit -= lost;
    }
    return {
      xLabel: `${formatDateLabel(m.date)} ${m.time}`,
      val: cumulativeProfit,
      outcome: m.outcome
    };
  });

  // Chart coordinates & boundaries
  const svgWidth = 600;
  const svgHeight = 240;
  const paddingX = 40;
  const paddingY = 30;
  
  const graphWidth = svgWidth - paddingX * 2;
  const graphHeight = svgHeight - paddingY * 2;

  // Find min and max values to scale Y axis
  const values = dataPoints.map(p => p.val);
  // Add a buffer of 0 so we always show the baseline
  values.push(0);
  let maxVal = Math.max(...values);
  let minVal = Math.min(...values);
  
  // Prevent division by zero if all values are equal
  if (maxVal === minVal) {
    maxVal += 10;
    minVal -= 10;
  }
  
  const range = maxVal - minVal;
  
  // Transform data points to SVG coordinate space
  const points = dataPoints.map((p, idx) => {
    const x = paddingX + (idx / (dataPoints.length - 1)) * graphWidth;
    const y = paddingY + graphHeight - ((p.val - minVal) / range) * graphHeight;
    return { x, y, val: p.val, label: p.xLabel, outcome: p.outcome };
  });

  // Calculate Y coordinate for 0 net profit baseline
  const zeroY = paddingY + graphHeight - ((0 - minVal) / range) * graphHeight;

  // Build SVG Content
  let svgContent = `
    <!-- Definitions for gradients and shadow filters -->
    <defs>
      <linearGradient id="chartGlowGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--color-cyan)" stop-opacity="0.18" />
        <stop offset="100%" stop-color="var(--color-cyan)" stop-opacity="0.00" />
      </linearGradient>
      
      <linearGradient id="winDotGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#10b981" />
        <stop offset="100%" stop-color="#059669" />
      </linearGradient>
      
      <linearGradient id="lossDotGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f43f5e" />
        <stop offset="100%" stop-color="#e11d48" />
      </linearGradient>
    </defs>
  `;

  // Draw Grid Lines (Horizontal Guidelines)
  const gridLinesCount = 4;
  for (let i = 0; i <= gridLinesCount; i++) {
    const val = minVal + (i / gridLinesCount) * range;
    const y = paddingY + graphHeight - (i / gridLinesCount) * graphHeight;
    
    // Draw dashed guideline
    svgContent += `<line class="chart-grid-line" x1="${paddingX}" y1="${y}" x2="${svgWidth - paddingX}" y2="${y}" />`;
    
    // Label Y axis
    svgContent += `
      <text class="chart-text" x="${paddingX - 8}" y="${y + 4}" text-anchor="end">
        ${currentCurrency}${Math.round(val)}
      </text>
    `;
  }

  // Draw Zero Profit Baseline (solid cyan-grey line)
  if (zeroY >= paddingY && zeroY <= paddingY + graphHeight) {
    svgContent += `
      <line class="chart-axis-line" x1="${paddingX}" y1="${zeroY}" x2="${svgWidth - paddingX}" y2="${zeroY}" />
      <text class="chart-text" x="${svgWidth - paddingX + 8}" y="${zeroY + 4}" text-anchor="start" fill="var(--color-cyan)">
        Baseline
      </text>
    `;
  }

  // Generate Path Strings
  let dPath = `M ${points[0].x} ${points[0].y}`;
  let areaPath = `M ${points[0].x} ${zeroY} L ${points[0].x} ${points[0].y}`;
  
  for (let i = 1; i < points.length; i++) {
    dPath += ` L ${points[i].x} ${points[i].y}`;
    areaPath += ` L ${points[i].x} ${points[i].y}`;
  }
  
  areaPath += ` L ${points[points.length - 1].x} ${zeroY} Z`;

  // Append paths
  svgContent += `<path class="chart-area" d="${areaPath}" />`;
  svgContent += `<path class="chart-line" d="${dPath}" />`;

  // Add Dots for Match Events
  points.forEach((p, idx) => {
    const isWin = p.outcome === 'win';
    svgContent += `
      <circle 
        class="chart-node ${isWin ? 'node-win' : 'node-loss'}" 
        cx="${p.x}" 
        cy="${p.y}" 
        r="5" 
        data-val="${p.val}" 
        data-label="${p.label}"
        onmouseover="showChartTooltip(event, '${p.label}', ${p.val})"
        onmouseout="hideChartTooltip()"
      />
    `;
  });

  chartSvg.innerHTML = svgContent;
}

// Custom simple chart tooltips
let activeTooltip = null;
function showChartTooltip(e, label, val) {
  hideChartTooltip();
  
  const tooltip = document.createElement('div');
  tooltip.className = 'glass-card chart-tooltip';
  tooltip.style.position = 'fixed';
  tooltip.style.padding = '0.4rem 0.75rem';
  tooltip.style.fontSize = '0.75rem';
  tooltip.style.zIndex = '1500';
  tooltip.style.border = '1px solid rgba(255, 255, 255, 0.1)';
  tooltip.style.backgroundColor = 'rgba(10, 15, 28, 0.9)';
  tooltip.style.color = 'var(--text-main)';
  tooltip.style.borderRadius = '6px';
  tooltip.style.pointerEvents = 'none';
  tooltip.style.fontFamily = 'var(--font-jakarta)';
  tooltip.style.boxShadow = 'var(--shadow-lg)';
  tooltip.style.whiteSpace = 'nowrap';
  
  const formattedVal = formatMoney(val);
  tooltip.innerHTML = `<strong>${formattedVal}</strong><br><span style="color:var(--text-muted);font-size:0.65rem;">${label}</span>`;
  
  document.body.appendChild(tooltip);
  activeTooltip = tooltip;
  
  // Position tooltip relative to cursor
  const updatePosition = (ev) => {
    if (!activeTooltip) return;
    activeTooltip.style.left = `${ev.clientX + 12}px`;
    activeTooltip.style.top = `${ev.clientY - 35}px`;
  };
  
  updatePosition(e);
  e.currentTarget.addEventListener('mousemove', updatePosition);
}

function hideChartTooltip() {
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
}

// ---------------- SYSTEM ACTIONS & MODALS ----------------

// Toggle view vs edit layout dynamically
function updateAdminModeUI() {
  const body = document.body;
  const statusBtn = document.getElementById('adminStatusBtn');
  const statusText = document.getElementById('adminStatusText');
  const lockIcon = document.getElementById('adminLockIcon');
  
  // Buttons
  const addLobbyBtn = document.getElementById('addLobbyBtn');
  const adminSettingsBtn = document.getElementById('adminSettingsBtn');
  const seedDemoBtn = document.getElementById('seedDemoBtn');

  if (isAdmin) {
    body.classList.add('unlocked-admin-mode');
    
    // Update badge status
    statusBtn.className = 'admin-badge-btn unlocked';
    statusText.textContent = 'Admin Mode';
    lockIcon.setAttribute('data-lucide', 'lock-open');
    
    // Enable administration interactions
    addLobbyBtn.removeAttribute('disabled');
    addLobbyBtn.classList.remove('disabled');
    adminSettingsBtn.removeAttribute('disabled');
    adminSettingsBtn.classList.remove('disabled');
    
    if (seedDemoBtn) seedDemoBtn.style.display = 'inline-flex';
  } else {
    body.classList.remove('unlocked-admin-mode');
    
    // Update badge status
    statusBtn.className = 'admin-badge-btn locked';
    statusText.textContent = 'Viewer Mode';
    lockIcon.setAttribute('data-lucide', 'lock');
    
    // Disable interactions
    addLobbyBtn.setAttribute('disabled', 'true');
    addLobbyBtn.classList.add('disabled');
    adminSettingsBtn.setAttribute('disabled', 'true');
    adminSettingsBtn.classList.add('disabled');
    
    if (seedDemoBtn) seedDemoBtn.style.display = 'none';
  }
  
  // Force update icons inside buttons
  lucide.createIcons();
  
  // Re-render matching history list to display/hide edit actions
  renderLobbyList();
}

function handleAdminBadgeClick() {
  if (isAdmin) {
    // Perform Lock
    isAdmin = false;
    updateAdminModeUI();
    showToast('Admin Mode locked. View mode active.', 'info');
  } else {
    // Open login modal
    openPinModal();
  }
}

// Pin Modal Management
function openPinModal() {
  tempPinInput = '';
  document.getElementById('pinErrorMessage').textContent = '';
  updatePinDots();
  
  const modal = document.getElementById('pinModal');
  modal.classList.add('active');
  
  // Set focus on input field (useful for physical keyboard)
  const inputEl = document.getElementById('pinInputField');
  inputEl.value = '';
  inputEl.focus();
}

function closePinModal() {
  const modal = document.getElementById('pinModal');
  modal.classList.remove('active');
  tempPinInput = '';
}

// Numerical PIN keypad events
function pressKey(key) {
  const errorMsg = document.getElementById('pinErrorMessage');
  errorMsg.textContent = '';

  if (key === 'clear') {
    tempPinInput = '';
    updatePinDots();
  } else if (key === 'submit') {
    submitPin();
  } else {
    if (tempPinInput.length < 4) {
      tempPinInput += key;
      updatePinDots();
      
      // Auto submit upon 4 digits
      if (tempPinInput.length === 4) {
        setTimeout(submitPin, 150);
      }
    }
  }
}

// Handle physical keyboard input inside PIN prompt
function handlePinInput(input) {
  const val = input.value.replace(/[^0-9]/g, '');
  tempPinInput = val.substring(0, 4);
  updatePinDots();
  
  if (tempPinInput.length === 4) {
    setTimeout(submitPin, 150);
  }
}

function updatePinDots() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((dot, index) => {
    if (index < tempPinInput.length) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
  
  // Keep the hidden input aligned for hardware keyboard users
  const inputEl = document.getElementById('pinInputField');
  if (inputEl.value !== tempPinInput) {
    inputEl.value = tempPinInput;
  }
}

function submitPin() {
  const pinInput = tempPinInput;
  if (pinInput === adminPIN) {
    isAdmin = true;
    updateAdminModeUI();
    closePinModal();
    showToast('Admin Mode unlocked. Edit privileges granted.', 'success');
  } else {
    // Wrong PIN
    tempPinInput = '';
    updatePinDots();
    
    const errorMsg = document.getElementById('pinErrorMessage');
    errorMsg.textContent = 'Incorrect Security PIN';
    
    // Add vibration animation to PIN dots wrapper
    const dotsContainer = document.querySelector('.pin-dots');
    dotsContainer.style.animation = 'none';
    // Trigger Reflow
    dotsContainer.offsetHeight; 
    dotsContainer.style.animation = 'shake 0.35s ease';
    
    // Focus hardware keyboard back on input
    document.getElementById('pinInputField').value = '';
    document.getElementById('pinInputField').focus();
    
    showToast('Authentication failed.', 'error');
  }
}

// Add/Edit Match Modal Management
function openAddLobbyModal() {
  if (!isAdmin) return;
  
  currentEditId = null;
  document.getElementById('lobbyForm').reset();
  
  // Set default values
  document.getElementById('lobbyDate').value = getTodayString();
  document.getElementById('editLobbyId').value = '';
  document.getElementById('lobbyModalTitle').textContent = 'Register New Lobby';
  
  // Initial states
  toggleOutcomeFields();
  calculateNetForm();
  
  const modal = document.getElementById('lobbyModal');
  modal.classList.add('active');
}

function openEditLobbyModal(id) {
  if (!isAdmin) return;
  
  const match = matches.find(m => m.id === id);
  if (!match) return;

  currentEditId = id;
  document.getElementById('editLobbyId').value = id;
  document.getElementById('lobbyDate').value = match.date;
  document.getElementById('lobbyTime').value = match.time;
  document.getElementById('lobbyPrice').value = match.price;
  
  if (match.outcome === 'win') {
    document.getElementById('outcomeWin').checked = true;
    document.getElementById('moneyWon').value = match.wonAmount;
  } else {
    document.getElementById('outcomeLoss').checked = true;
    document.getElementById('moneyLost').value = match.lostAmount;
  }

  document.getElementById('lobbyModalTitle').textContent = 'Modify Lobby Entry';
  
  toggleOutcomeFields();
  calculateNetForm();
  
  const modal = document.getElementById('lobbyModal');
  modal.classList.add('active');
}

function closeLobbyModal() {
  const modal = document.getElementById('lobbyModal');
  modal.classList.remove('active');
  currentEditId = null;
}

// Manage visibility of payout parameters based on Win/Loss selections
function toggleOutcomeFields() {
  const isWin = document.getElementById('outcomeWin').checked;
  const wonGroup = document.getElementById('moneyWonGroup');
  const lostGroup = document.getElementById('moneyLostGroup');
  const lobbyPriceInput = document.getElementById('lobbyPrice');
  
  if (isWin) {
    wonGroup.style.display = 'block';
    lostGroup.style.display = 'none';
    document.getElementById('moneyWon').setAttribute('required', 'true');
    document.getElementById('moneyLost').removeAttribute('required');
  } else {
    wonGroup.style.display = 'none';
    lostGroup.style.display = 'block';
    document.getElementById('moneyWon').removeAttribute('required');
    document.getElementById('moneyLost').setAttribute('required', 'true');
    
    // Set default loss value to match the entry fee if empty
    const priceVal = parseFloat(lobbyPriceInput.value) || 0;
    const lostInput = document.getElementById('moneyLost');
    if (!lostInput.value || parseFloat(lostInput.value) === 0) {
      lostInput.value = priceVal > 0 ? priceVal : '';
    }
  }
  calculateNetForm();
}

function setQuickTime(timeStr) {
  document.getElementById('lobbyTime').value = timeStr;
}

// Form Net Profit Preview Calculator
function calculateNetForm() {
  const price = parseFloat(document.getElementById('lobbyPrice').value) || 0;
  const isWin = document.getElementById('outcomeWin').checked;
  let netVal = 0;

  if (isWin) {
    const won = parseFloat(document.getElementById('moneyWon').value) || 0;
    netVal = won - price;
  } else {
    const lost = parseFloat(document.getElementById('moneyLost').value) || 0;
    netVal = -lost;
  }

  const previewEl = document.getElementById('formNetPreview');
  previewEl.textContent = formatMoney(netVal);
  
  if (netVal > 0) {
    previewEl.className = 'preview-value positive';
  } else if (netVal < 0) {
    previewEl.className = 'preview-value negative';
  } else {
    previewEl.className = 'preview-value';
  }
}

// Save matching action (Insert/Update)
function saveLobby(event) {
  event.preventDefault();
  if (!isAdmin) return;

  const id = document.getElementById('editLobbyId').value;
  const date = document.getElementById('lobbyDate').value;
  const time = document.getElementById('lobbyTime').value.trim();
  const price = parseFloat(document.getElementById('lobbyPrice').value) || 0;
  const isWin = document.getElementById('outcomeWin').checked;
  const wonAmount = isWin ? (parseFloat(document.getElementById('moneyWon').value) || 0) : 0;
  const lostAmount = !isWin ? (parseFloat(document.getElementById('moneyLost').value) || 0) : 0;

  if (isWin && wonAmount < 0) {
    showToast('Earnings cannot be negative', 'error');
    return;
  }

  const lobbyEntry = {
    id: id || 'lobby_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    date,
    time,
    price,
    outcome: isWin ? 'win' : 'loss',
    wonAmount: isWin ? wonAmount : 0,
    lostAmount: !isWin ? lostAmount : price // ensure default backup
  };

  let updatedMatches = [...matches];
  if (id) {
    // Edit existing
    const idx = updatedMatches.findIndex(m => m.id === id);
    if (idx !== -1) {
      updatedMatches[idx] = lobbyEntry;
    }
  } else {
    // Add new
    updatedMatches.push(lobbyEntry);
  }

  if (dbRef) {
    dbRef.child('matches').set(updatedMatches)
      .then(() => {
        showToast(id ? 'Lobby modified on cloud.' : 'Lobby added to cloud.', 'success');
      })
      .catch((err) => {
        console.error("Cloud save failed, falling back to local:", err);
        matches = updatedMatches;
        localStorage.setItem('lobby_tracker_matches', JSON.stringify(matches));
        renderDashboard();
        showToast('Saved locally. Cloud sync failed.', 'error');
      });
  } else {
    matches = updatedMatches;
    localStorage.setItem('lobby_tracker_matches', JSON.stringify(matches));
    renderDashboard();
    showToast(id ? 'Lobby modified locally.' : 'Lobby added locally.', 'success');
  }

  closeLobbyModal();
}

function deleteLobby(id) {
  if (!isAdmin) return;

  const match = matches.find(m => m.id === id);
  if (!match) return;

  const confirmMsg = `Remove lobby match play on ${formatDateLabel(match.date)} at ${match.time}?`;
  if (confirm(confirmMsg)) {
    const updatedMatches = matches.filter(m => m.id !== id);
    
    if (dbRef) {
      dbRef.child('matches').set(updatedMatches)
        .then(() => {
          showToast('Lobby deleted from cloud.', 'info');
        })
        .catch((err) => {
          console.error("Cloud delete failed, falling back to local:", err);
          matches = updatedMatches;
          localStorage.setItem('lobby_tracker_matches', JSON.stringify(matches));
          renderDashboard();
          showToast('Deleted locally. Cloud sync failed.', 'error');
        });
    } else {
      matches = updatedMatches;
      localStorage.setItem('lobby_tracker_matches', JSON.stringify(matches));
      renderDashboard();
      showToast('Deleted locally.', 'info');
    }
  }
}

// ---------------- SETTINGS & UTILITIES ----------------

function openAdminSettingsModal() {
  if (!isAdmin) return;
  
  // Clear any dynamic status reports
  document.getElementById('pinUpdateStatus').className = 'status-msg';
  document.getElementById('pinUpdateStatus').textContent = '';
  document.getElementById('currentPin').value = '';
  document.getElementById('newPin').value = '';

  const modal = document.getElementById('settingsModal');
  modal.classList.add('active');
}

function closeAdminSettingsModal() {
  const modal = document.getElementById('settingsModal');
  modal.classList.remove('active');
}

// Settings Action: Change admin auth PIN
function changeAdminPin(event) {
  event.preventDefault();
  if (!isAdmin) return;

  const currentPin = document.getElementById('currentPin').value;
  const newPin = document.getElementById('newPin').value;
  const statusEl = document.getElementById('pinUpdateStatus');

  if (currentPin !== adminPIN) {
    statusEl.className = 'status-msg error';
    statusEl.textContent = 'Incorrect current PIN verification.';
    return;
  }

  if (newPin.length !== 4 || isNaN(newPin)) {
    statusEl.className = 'status-msg error';
    statusEl.textContent = 'New PIN must be exactly 4 numerical digits.';
    return;
  }

  adminPIN = newPin;
  localStorage.setItem('lobby_tracker_pin', adminPIN);
  
  if (dbRef) {
    dbRef.child('adminPIN').set(adminPIN)
      .then(() => {
        statusEl.className = 'status-msg success';
        statusEl.textContent = 'Security PIN successfully updated on Cloud!';
        showToast('Admin security PIN changed on Cloud.', 'success');
      })
      .catch(err => {
        console.error("Firebase PIN save failed:", err);
        statusEl.className = 'status-msg success';
        statusEl.textContent = 'Security PIN updated locally.';
        showToast('PIN updated locally. Cloud save failed.', 'error');
      });
  } else {
    statusEl.className = 'status-msg success';
    statusEl.textContent = 'Security PIN successfully updated locally!';
    showToast('Admin security PIN changed locally.', 'success');
  }
  
  document.getElementById('currentPin').value = '';
  document.getElementById('newPin').value = '';
}

// Settings Action: Modify active currency prefix
function changeCurrency(symbol) {
  currentCurrency = symbol;
  localStorage.setItem('lobby_tracker_currency', symbol);
  updateCurrencyLabelElements();
  renderDashboard();
  showToast(`Currency symbol modified to ${symbol}`, 'success');
}

// Settings Action: Back up database as JSON
function exportData() {
  if (!isAdmin) return;
  
  const payload = {
    app: 'LobbyMoneyTracker',
    version: '1.0.0',
    exportDate: new Date().toISOString(),
    currency: currentCurrency,
    matches: matches
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `lobby_tracker_backup_${getTodayString()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  showToast('Database exported successfully.', 'success');
}

// Settings Action: Restore database from JSON file
function importData(event) {
  if (!isAdmin) return;

  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const payload = JSON.parse(e.target.result);
      
      // Simple validation check
      if (payload.app !== 'LobbyMoneyTracker' || !Array.isArray(payload.matches)) {
        throw new Error('Invalid JSON schema format.');
      }

      // Restructure local memory states
      matches = payload.matches;
      if (payload.currency) {
        currentCurrency = payload.currency;
        document.getElementById('currencySelect').value = currentCurrency;
        localStorage.setItem('lobby_tracker_currency', currentCurrency);
        updateCurrencyLabelElements();
      }

      if (dbRef) {
        dbRef.child('matches').set(matches)
          .then(() => showToast('Database successfully restored to Cloud!', 'success'))
          .catch(err => {
            console.error("Firebase restore failed:", err);
            localStorage.setItem('lobby_tracker_matches', JSON.stringify(matches));
            renderDashboard();
            showToast('Restored locally. Cloud upload failed.', 'error');
          });
      } else {
        localStorage.setItem('lobby_tracker_matches', JSON.stringify(matches));
        renderDashboard();
        showToast('Database successfully restored locally!', 'success');
      }

      closeAdminSettingsModal();
    } catch (err) {
      showToast('Restore failed: Invalid file format.', 'error');
      console.error(err);
    }
  };
  reader.readAsText(file);
}

// Settings Action: Empty matches store
function clearAllData() {
  if (!isAdmin) return;

  const confirmMsg = "CRITICAL: Are you sure you want to permanently erase all matches? This action is irreversible!";
  if (confirm(confirmMsg)) {
    if (dbRef) {
      dbRef.child('matches').remove()
        .then(() => showToast('All cloud lobby records wiped.', 'error'))
        .catch(err => {
          console.error("Firebase wipe failed:", err);
          matches = [];
          localStorage.removeItem('lobby_tracker_matches');
          renderDashboard();
          showToast('Wiped locally. Cloud wipe failed.', 'error');
        });
    } else {
      matches = [];
      localStorage.removeItem('lobby_tracker_matches');
      renderDashboard();
      showToast('All local lobby records wiped.', 'error');
    }
    closeAdminSettingsModal();
  }
}

// Settings Action: Seed demo matches data for visual preview
function seedDemoData() {
  if (!isAdmin) return;
  
  // Calculate relative dates for demo data
  const dateOffset = (days) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const demoMatches = [
    {
      id: 'demo_1',
      date: dateOffset(4),
      time: '3:00 PM',
      price: 100,
      outcome: 'win',
      wonAmount: 250,
      lostAmount: 0
    },
    {
      id: 'demo_2',
      date: dateOffset(4),
      time: '6:00 PM',
      price: 100,
      outcome: 'loss',
      wonAmount: 0,
      lostAmount: 100
    },
    {
      id: 'demo_3',
      date: dateOffset(3),
      time: '3:00 PM',
      price: 150,
      outcome: 'win',
      wonAmount: 400,
      lostAmount: 0
    },
    {
      id: 'demo_4',
      date: dateOffset(2),
      time: '9:00 PM',
      price: 150,
      outcome: 'loss',
      wonAmount: 0,
      lostAmount: 150
    },
    {
      id: 'demo_5',
      date: dateOffset(1),
      time: '3:00 PM',
      price: 200,
      outcome: 'win',
      wonAmount: 550,
      lostAmount: 0
    },
    {
      id: 'demo_6',
      date: dateOffset(0),
      time: '6:00 PM',
      price: 200,
      outcome: 'win',
      wonAmount: 450,
      lostAmount: 0
    }
  ];

  if (dbRef) {
    dbRef.child('matches').set(demoMatches)
      .then(() => showToast('Demo matches loaded to Cloud!', 'success'))
      .catch(err => {
        console.error("Firebase demo seed failed:", err);
        matches = demoMatches;
        localStorage.setItem('lobby_tracker_matches', JSON.stringify(matches));
        renderDashboard();
        showToast('Demo matches loaded locally.', 'success');
      });
  } else {
    matches = demoMatches;
    localStorage.setItem('lobby_tracker_matches', JSON.stringify(matches));
    renderDashboard();
    showToast('Demo matches loaded locally.', 'success');
  }
  
  // Close settings modal if open
  closeAdminSettingsModal();
}

// ---------------- FILTERS & EVENT HANDLERS ----------------

function setFilterTab(tabName) {
  activeFilterTab = tabName;
  
  // Highlight active tab
  document.querySelectorAll('.filter-tab').forEach(tab => {
    if (tab.dataset.filter === tabName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  renderLobbyList();
}

function filterLobbies() {
  searchText = document.getElementById('searchInput').value;
  renderLobbyList();
}

// ---------------- DATA FORMATTING UTILS ----------------

// Convert "YYYY-MM-DD" to human readable "12 Jul" or "July 12"
function formatDateLabel(dateStr) {
  const dateObj = new Date(dateStr + 'T00:00:00');
  const options = { day: 'numeric', month: 'short' };
  return dateObj.toLocaleDateString('en-US', options);
}

// Convert 12 hour clock (e.g. "3:00 PM") to 24 hour string ("15:00") for sorting
function convertTo24Hour(timeStr) {
  if (!timeStr) return "00:00";
  
  // Try matching components
  const match = timeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) return "00:00"; // fallback

  let hours = parseInt(match[1]);
  const minutes = match[2];
  const ampm = match[3].toUpperCase();

  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  return `${String(hours).padStart(2, '0')}:${minutes}`;
}
