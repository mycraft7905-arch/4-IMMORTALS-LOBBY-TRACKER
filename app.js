// ═══════════════════════════════════════════════════
//  4 IMMORTALS V3.5 — app.js
//  5-Person Weekly Profit, Loss Recovery & Wallet Tracker
// ═══════════════════════════════════════════════════

// ── Core State ──
let state = {
  // 5 Team Members Configuration
  members: [
    { id: 'm_p1', role: 'Player 1', name: 'Player 1', share: 20, color: '#00f2fe' },
    { id: 'm_p2', role: 'Player 2', name: 'Player 2', share: 20, color: '#3b82f6' },
    { id: 'm_p3', role: 'Player 3', name: 'Player 3', share: 20, color: '#8b5cf6' },
    { id: 'm_p4', role: 'Player 4', name: 'Player 4', share: 20, color: '#ec4899' },
    { id: 'm_mgr', role: 'Manager', name: 'Manager', share: 20, color: '#f59e0b' }
  ],
  memberWallets: { m_p1: 0, m_p2: 0, m_p3: 0, m_p4: 0, m_mgr: 0 },
  memberPayments: [],    // [{ id, memberId, amount, date, note, timestamp }]
  transactions: [],      // [{ id, date, description, type, amount, category, note, timestamp, weekId }]
  weeklySettlements: [], // [{ weekId, weekLabel, startDate, endDate, totalIncome, totalExpenses, netResult, previousLossToRecover, lossRecoveredThisWeek, remainingLossToRecover, distributableProfit, amountPerMember, walletsSnapshot, closedAt, status: 'closed' }]
  lossToRecover: 0,

  // PRESERVED Legacy Match Registry (Requirement 19)
  matches: [],
  players: [],

  // App & Auth State
  adminPIN: '0852',
  isAdmin: false,
  activeTab: 'finance', // 'finance', 'settlements', 'standings'
  txFilterTab: 'all',
  txSearchText: '',
  matchSearchText: ''
};

// ── Firebase Configuration ──
const DEFAULT_FIREBASE_DB_URL = "https://scrim-management-default-rtdb.asia-southeast1.firebasedatabase.app/";
let firebaseApp = null;
let dbRef = null;

// ── DOM Utilities ──
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// ═══════════════════════════════════════════════════
//  IST DATE & WEEK CALCULATIONS
// ═══════════════════════════════════════════════════
function getISTNow() {
  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcMs + (330 * 60000));
}

function getTodayString() {
  const ist = getISTNow();
  return ist.toISOString().split('T')[0];
}

function getWeekRange(dateInput) {
  const d = dateInput ? new Date(dateInput) : getISTNow();
  const day = d.getDay(); // 0 is Sunday, 1 is Monday...
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const startStr = monday.toISOString().split('T')[0];
  const endStr = sunday.toISOString().split('T')[0];
  const weekId = `${startStr}_${endStr}`;
  
  const options = { month: 'short', day: 'numeric' };
  const label = `${monday.toLocaleDateString('en-US', options)} – ${sunday.toLocaleDateString('en-US', options)}, ${sunday.getFullYear()}`;

  return { weekId, startStr, endStr, monday, sunday, label };
}

function getCurrentWeekInfo() {
  return getWeekRange();
}

// ═══════════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  try {
    loadLocalState();
    
    if ($('#txDate')) $('#txDate').value = getTodayString();
    if ($('#lobbyDate')) $('#lobbyDate').value = getTodayString();
    if ($('#payDate')) $('#payDate').value = getTodayString();

    updateTime();
    setInterval(updateTime, 60000);

    if (typeof VanillaTilt !== 'undefined') {
      VanillaTilt.init($$("[data-tilt]"), {
        max: 5, speed: 400, glare: true, "max-glare": 0.2
      });
    }

    renderAll();
    initFirebase();
    
    setTimeout(() => {
      $('#appLoader')?.classList.remove('active');
      if ($('#mainAppShell')) $('#mainAppShell').style.display = 'flex';
      lucide.createIcons();
    }, 800);

  } catch(e) { console.error("Init Error:", e); }
});

function loadLocalState() {
  state.adminPIN = localStorage.getItem('ltx_pin') || '0852';
  state.lossToRecover = parseFloat(localStorage.getItem('ltx_lossToRecover')) || 0;
  
  const savedMembers = localStorage.getItem('ltx_members');
  if (savedMembers) { try { state.members = JSON.parse(savedMembers); } catch(e){} }
  
  const savedWallets = localStorage.getItem('ltx_wallets');
  if (savedWallets) { try { state.memberWallets = JSON.parse(savedWallets); } catch(e){} }

  state.transactions = JSON.parse(localStorage.getItem('ltx_transactions') || '[]');
  state.memberPayments = JSON.parse(localStorage.getItem('ltx_payments') || '[]');
  state.weeklySettlements = JSON.parse(localStorage.getItem('ltx_settlements') || '[]');
  
  // Legacy preserved match data
  state.matches = JSON.parse(localStorage.getItem('ltx_matches') || '[]');
  state.players = JSON.parse(localStorage.getItem('ltx_players') || '[]');
}

function saveLocalState() {
  localStorage.setItem('ltx_pin', state.adminPIN);
  localStorage.setItem('ltx_lossToRecover', state.lossToRecover.toString());
  localStorage.setItem('ltx_members', JSON.stringify(state.members));
  localStorage.setItem('ltx_wallets', JSON.stringify(state.memberWallets));
  localStorage.setItem('ltx_transactions', JSON.stringify(state.transactions));
  localStorage.setItem('ltx_payments', JSON.stringify(state.memberPayments));
  localStorage.setItem('ltx_settlements', JSON.stringify(state.weeklySettlements));
  localStorage.setItem('ltx_matches', JSON.stringify(state.matches));
  localStorage.setItem('ltx_players', JSON.stringify(state.players));
}

function renderAll() {
  renderFinanceTab();
  renderSettlementsTab();
  renderStandingsTab();
  updateTime();
}

// ═══════════════════════════════════════════════════
//  FIREBASE & AUTH
// ═══════════════════════════════════════════════════
function initFirebase() {
  const dbUrl = DEFAULT_FIREBASE_DB_URL;
  localStorage.setItem('ltx_firebase_url', dbUrl);

  if ($('#firebaseDbInput')) {
    $('#firebaseDbInput').value = dbUrl;
  }

  if (firebaseApp) { try { firebaseApp.delete(); } catch(e){} }
  setSyncStatus('syncing', 'Connecting Cloud...');

  try {
    firebaseApp = firebase.initializeApp({ databaseURL: dbUrl }, 'LTXV35_' + Date.now());
    const database = firebase.database(firebaseApp);
    dbRef = database.ref();

    database.ref('.info/connected').on('value', snap => {
      setSyncStatus(snap.val() ? 'online' : 'offline', snap.val() ? 'Sync Active' : 'Offline Mode');
    });

    dbRef.child('adminPIN').on('value', snap => { if (snap.val()) state.adminPIN = snap.val(); });
    dbRef.child('lossToRecover').on('value', snap => { if (snap.val() !== null) { state.lossToRecover = parseFloat(snap.val()) || 0; renderAll(); } });
    dbRef.child('membersConfig').on('value', snap => { if (snap.val()) { state.members = snap.val(); renderAll(); } });
    dbRef.child('memberWallets').on('value', snap => { if (snap.val()) { state.memberWallets = snap.val(); renderAll(); } });
    dbRef.child('transactions').on('value', snap => { if (snap.val()) { state.transactions = snap.val(); renderAll(); } });
    dbRef.child('memberPayments').on('value', snap => { if (snap.val()) { state.memberPayments = snap.val(); renderAll(); } });
    dbRef.child('weeklySettlements').on('value', snap => { if (snap.val()) { state.weeklySettlements = snap.val(); renderAll(); } });
    
    // Legacy preserved matches & players listener
    dbRef.child('matches').on('value', snap => { if (snap.val()) { state.matches = snap.val(); renderStandingsTab(); } });
    dbRef.child('players').on('value', snap => { if (snap.val()) { state.players = snap.val(); renderStandingsTab(); } });

  } catch(err) {
    console.error("Firebase Connection Error:", err);
    setSyncStatus('offline', 'Sync Offline');
  }
}

function setSyncStatus(status, text) {
  const ind = $('#syncStatusIndicator'), txt = $('#syncStatusText');
  if (ind && txt) {
    ind.className = `status-indicator ${status}`;
    txt.textContent = text;
  }
}

function cloudSave(path, data, successMsg, localFallback) {
  if (dbRef && state.isAdmin) {
    dbRef.child(path).set(data).then(() => {
      if (successMsg) showToast(successMsg, 'success');
      saveLocalState();
    }).catch(() => {
      saveLocalState();
      if (localFallback) localFallback();
    });
  } else {
    saveLocalState();
    if (localFallback) localFallback();
  }
}

function syncAllFinancialState(successMsg, callback) {
  saveLocalState();
  if (dbRef && state.isAdmin) {
    Promise.all([
      dbRef.child('lossToRecover').set(state.lossToRecover),
      dbRef.child('memberWallets').set(state.memberWallets),
      dbRef.child('membersConfig').set(state.members),
      dbRef.child('transactions').set(state.transactions),
      dbRef.child('memberPayments').set(state.memberPayments),
      dbRef.child('weeklySettlements').set(state.weeklySettlements)
    ]).then(() => {
      if (successMsg) showToast(successMsg, 'success');
      if (callback) callback();
    }).catch(err => {
      if (callback) callback();
    });
  } else {
    if (successMsg) showToast(successMsg, 'success');
    if (callback) callback();
  }
}

// ═══════════════════════════════════════════════════
//  NAVIGATION & UI HELPERS
// ═══════════════════════════════════════════════════
function switchTab(tab) {
  state.activeTab = tab;
  $$('.tab-panel').forEach(p => p.classList.remove('active'));
  
  const tabMap = { finance: 'panelFinance', settlements: 'panelSettlements', standings: 'panelStandings' };
  $(`#${tabMap[tab]}`)?.classList.add('active');

  $$('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
  const btnMap = { finance: 'bnFinance', settlements: 'bnSettlements', standings: 'bnStandings' };
  $(`#${btnMap[tab]}`)?.classList.add('active');

  renderAll();
  lucide.createIcons();
}

function updateTime() {
  const ist = getISTNow();
  const dateStr = ist.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = ist.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  
  if ($('.date')) $('.date').textContent = dateStr;
  if ($('.time-badge')) $('.time-badge').textContent = `${timeStr} IST`;
}

function showToast(msg, type = 'info') {
  const container = $('#toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-triangle' : 'info';
  toast.innerHTML = `<i data-lucide="${icon}"></i><span class="toast-message">${msg}</span>`;
  container.appendChild(toast);
  lucide.createIcons();
  setTimeout(() => { toast.style.animation = 'slideUp 0.3s reverse forwards'; setTimeout(() => toast.remove(), 300); }, 3500);
}

function formatMoney(amount) {
  const val = Math.abs(amount || 0);
  return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ═══════════════════════════════════════════════════
//  FINANCIAL ENGINE & CALCULATIONS
// ═══════════════════════════════════════════════════
function calculateCurrentWeekStats() {
  const currentWeek = getCurrentWeekInfo();
  
  // Filter transactions for current week range
  const currentTxList = state.transactions.filter(t => {
    if (t.weekId) return t.weekId === currentWeek.weekId;
    return t.date >= currentWeek.startStr && t.date <= currentWeek.endStr;
  });

  let income = 0, expenses = 0;
  currentTxList.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'income') income += amt;
    else if (t.type === 'expense') expenses += amt;
  });

  const net = income - expenses;
  const prevLoss = state.lossToRecover || 0;

  let lossRecovered = 0, remainingLoss = 0, distributableProfit = 0;

  if (net > 0) {
    lossRecovered = Math.min(net, prevLoss);
    remainingLoss = Math.max(0, prevLoss - net);
    distributableProfit = Math.max(0, net - prevLoss);
  } else {
    lossRecovered = 0;
    remainingLoss = prevLoss + Math.abs(net);
    distributableProfit = 0;
  }

  const perMemberGain = distributableProfit * 0.20;

  return {
    currentWeek,
    currentTxList,
    income,
    expenses,
    net,
    prevLoss,
    lossRecovered,
    remainingLoss,
    distributableProfit,
    perMemberGain
  };
}

function getMemberPaidAmount(memberId) {
  return state.memberPayments
    .filter(p => p.memberId === memberId)
    .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
}

// ═══════════════════════════════════════════════════
//  TAB 1: FINANCE HQ RENDERING
// ═══════════════════════════════════════════════════
function renderFinanceTab() {
  const stats = calculateCurrentWeekStats();

  // Top Stat Cards
  if ($('#weekNetResult')) {
    $('#weekNetResult').textContent = `${stats.net >= 0 ? '+' : '-'}${formatMoney(stats.net)}`;
    $('#weekNetResult').className = `stat-value orbitron ${stats.net >= 0 ? 'won-color' : 'lost-color'}`;
  }
  if ($('#weekNetSubtext')) $('#weekNetSubtext').textContent = stats.currentWeek.label;

  if ($('#lossToRecoverVal')) $('#lossToRecoverVal').textContent = formatMoney(stats.remainingLoss);
  if ($('#distributableProfitVal')) $('#distributableProfitVal').textContent = formatMoney(stats.distributableProfit);
  if ($('#distributableShareText')) $('#distributableShareText').textContent = `${formatMoney(stats.perMemberGain)} / member (20%)`;

  if ($('#weekIncome')) $('#weekIncome').textContent = formatMoney(stats.income);
  if ($('#weekExpenses')) $('#weekExpenses').textContent = formatMoney(stats.expenses);

  // 5-Member Team Wallet Table
  renderWalletTable();

  // Weekly Performance Graph
  renderFinancialChart();

  // Current Week Transactions List
  renderTransactionsList(stats.currentTxList);
}

function renderWalletTable() {
  const tbody = $('#walletTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  state.members.forEach(m => {
    const earned = state.memberWallets[m.id] || 0;
    const paid = getMemberPaidAmount(m.id);
    const pending = earned - paid;
    const inits = m.name.substring(0, 2).toUpperCase();

    tbody.innerHTML += `
      <tr>
        <td>
          <div class="member-cell">
            <div class="member-avatar-chip" style="background:${m.color}">${inits}</div>
            <div>
              <div>${m.name}</div>
              <div class="member-role-badge">${m.role}</div>
            </div>
          </div>
        </td>
        <td><span class="share-badge">20%</span></td>
        <td><span class="wallet-val">${formatMoney(earned)}</span></td>
        <td><span class="paid-val">${formatMoney(paid)}</span></td>
        <td>
          <span class="pending-val ${pending <= 0 ? 'zero' : ''}">
            ${formatMoney(pending)}
          </span>
        </td>
        <td class="text-right">
          <button class="btn btn-ghost btn-sm ${!state.isAdmin ? 'disabled' : ''}" onclick="openPaymentModal('${m.id}')" ${!state.isAdmin ? 'disabled' : ''}>
            <i data-lucide="banknote"></i> Pay
          </button>
        </td>
      </tr>
    `;
  });
  lucide.createIcons();
}

function renderTransactionsList(currentTxList) {
  const list = $('#txList'), empty = $('#emptyTxState');
  if (!list) return;
  list.innerHTML = '';

  let filtered = [...currentTxList].sort((a,b) => b.timestamp - a.timestamp);
  if (state.txFilterTab === 'income') filtered = filtered.filter(t => t.type === 'income');
  else if (state.txFilterTab === 'expense') filtered = filtered.filter(t => t.type === 'expense');

  const q = state.txSearchText.toLowerCase();
  if (q) filtered = filtered.filter(t => t.description.toLowerCase().includes(q) || (t.category||'').toLowerCase().includes(q) || (t.note||'').toLowerCase().includes(q));

  if (filtered.length === 0) { if (empty) empty.style.display = 'flex'; list.style.display = 'none'; return; }
  if (empty) empty.style.display = 'none'; list.style.display = 'flex';

  filtered.forEach(t => {
    const isIncome = t.type === 'income';
    const amt = parseFloat(t.amount) || 0;

    list.innerHTML += `
      <div class="tx-card">
        <div class="tx-left">
          <div class="${isIncome ? 'badge-income' : 'badge-expense'}">
            <i data-lucide="${isIncome ? 'trending-up' : 'trending-down'}"></i>
          </div>
          <div class="tx-info">
            <div class="tx-desc">${t.description}</div>
            <div class="tx-sub">
              <span>${t.date}</span>
              ${t.category ? `• <span class="tag-map">${t.category}</span>` : ''}
              ${t.note ? `• <em>${t.note}</em>` : ''}
            </div>
          </div>
        </div>
        <div class="tx-right text-right" style="display:flex; align-items:center; gap:0.75rem;">
          <div class="tx-amount ${isIncome ? 'won-color' : 'lost-color'}">${isIncome ? '+' : '-'}${formatMoney(amt)}</div>
          ${state.isAdmin ? `
            <button class="action-btn delete-btn" onclick="deleteTransaction('${t.id}')" title="Delete Transaction"><i data-lucide="trash-2"></i></button>
          ` : ''}
        </div>
      </div>
    `;
  });
  lucide.createIcons();
}

function setTxFilterTab(tab) {
  state.txFilterTab = tab;
  $$('[data-txfilter]').forEach(t => t.classList.toggle('active', t.dataset.txfilter === tab));
  renderFinanceTab();
}

function filterTransactions() {
  state.txSearchText = $('#txSearchInput').value;
  renderFinanceTab();
}

// ═══════════════════════════════════════════════════
//  TRANSACTIONS MANAGEMENT
// ═══════════════════════════════════════════════════
function openAddTxModal() {
  if (!state.isAdmin) return;
  $('#txForm').reset();
  $('#editTxId').value = '';
  $('#txDate').value = getTodayString();
  updateTxTypeStyling();
  $('#transactionModal').classList.add('active');
}

function closeTxModal() { $('#transactionModal').classList.remove('active'); }

function updateTxTypeStyling() {
  const isIncome = $('#txTypeIncome').checked;
  const label = $('#txModalTitle');
  if (label) label.textContent = isIncome ? 'Add Income Transaction' : 'Add Expense Transaction';
}

function saveTransaction(e) {
  e.preventDefault();
  if (!state.isAdmin) return;

  const isIncome = $('#txTypeIncome').checked;
  const amount = parseFloat($('#txAmount').value) || 0;
  const date = $('#txDate').value || getTodayString();
  const description = $('#txDescription').value.trim();
  const category = $('#txCategory').value;
  const note = $('#txNote').value.trim();

  if (amount <= 0 || !description) return showToast('Please enter valid amount and description', 'error');

  const currentWeek = getWeekRange(date);

  const entry = {
    id: 'tx_' + Date.now(),
    date,
    description,
    type: isIncome ? 'income' : 'expense',
    amount,
    category,
    note,
    weekId: currentWeek.weekId,
    timestamp: Date.now()
  };

  state.transactions = [entry, ...state.transactions];

  syncAllFinancialState("Transaction Saved!", () => {
    closeTxModal();
    renderAll();
  });
}

function deleteTransaction(id) {
  if (!state.isAdmin || !confirm('Delete this transaction?')) return;
  state.transactions = state.transactions.filter(t => t.id !== id);
  syncAllFinancialState("Transaction Deleted", () => { renderAll(); });
}

// ═══════════════════════════════════════════════════
//  TAB 2: SETTLEMENTS & PAYMENTS RENDERING
// ═══════════════════════════════════════════════════
function renderSettlementsTab() {
  const stats = calculateCurrentWeekStats();
  const isClosed = isCurrentWeekClosed();

  if ($('#settlementWeekBadge')) $('#settlementWeekBadge').textContent = `Week ${state.weeklySettlements.length + 1}`;
  if ($('#settleRangeText')) $('#settleRangeText').textContent = stats.currentWeek.label;
  
  if ($('#settleStatusBadge')) {
    $('#settleStatusBadge').textContent = isClosed ? 'Closed & Settled' : 'Active / Open';
    $('#settleStatusBadge').style.borderColor = isClosed ? 'var(--win)' : 'var(--cyan)';
    $('#settleStatusBadge').style.color = isClosed ? 'var(--win)' : 'var(--cyan)';
  }

  if ($('#settleProjectedNet')) {
    $('#settleProjectedNet').textContent = `${stats.net >= 0 ? '+' : '-'}${formatMoney(stats.net)}`;
    $('#settleProjectedNet').className = `info-val orbitron ${stats.net >= 0 ? 'won-color' : 'lost-color'}`;
  }

  if ($('#settleProjectedPerMember')) {
    $('#settleProjectedPerMember').textContent = `+${formatMoney(stats.perMemberGain)}`;
  }

  const triggerBtn = $('#settleWeekTriggerBtn');
  if (triggerBtn) {
    if (isClosed) {
      triggerBtn.classList.add('disabled');
      triggerBtn.setAttribute('disabled', 'true');
      triggerBtn.innerHTML = `<i data-lucide="check-circle"></i> This Week Already Settled`;
    } else {
      if (state.isAdmin) {
        triggerBtn.classList.remove('disabled');
        triggerBtn.removeAttribute('disabled');
      } else {
        triggerBtn.classList.add('disabled');
        triggerBtn.setAttribute('disabled', 'true');
      }
      triggerBtn.innerHTML = `<i data-lucide="check-circle-2"></i> Close & Settle This Week`;
    }
  }

  // Render Closed Weeks List
  renderClosedWeeksHistory();

  // Render Payment Log
  renderPaymentsLedger();
}

function isCurrentWeekClosed() {
  const currentWeek = getCurrentWeekInfo();
  return state.weeklySettlements.some(s => s.weekId === currentWeek.weekId && s.status === 'closed');
}

function openSettleWeekModal() {
  if (!state.isAdmin) return;
  const stats = calculateCurrentWeekStats();

  if (isCurrentWeekClosed()) {
    return showToast("This week is already settled!", "error");
  }

  if ($('#previewSettleRange')) $('#previewSettleRange').textContent = stats.currentWeek.label;
  if ($('#previewSettleIncome')) $('#previewSettleIncome').textContent = formatMoney(stats.income);
  if ($('#previewSettleExpenses')) $('#previewSettleExpenses').textContent = formatMoney(stats.expenses);
  if ($('#previewSettleNet')) {
    $('#previewSettleNet').textContent = `${stats.net >= 0 ? '+' : '-'}${formatMoney(stats.net)}`;
    $('#previewSettleNet').className = `orbitron ${stats.net >= 0 ? 'won-color' : 'lost-color'}`;
  }
  if ($('#previewSettlePrevLoss')) $('#previewSettlePrevLoss').textContent = formatMoney(stats.prevLoss);
  if ($('#previewSettleLossRecovered')) $('#previewSettleLossRecovered').textContent = formatMoney(stats.lossRecovered);
  if ($('#previewSettleRemainingLoss')) $('#previewSettleRemainingLoss').textContent = formatMoney(stats.remainingLoss);
  if ($('#previewSettleDistributable')) $('#previewSettleDistributable').textContent = formatMoney(stats.distributableProfit);

  // Wallet Gains Preview List
  const list = $('#previewWalletGainsList');
  if (list) {
    list.innerHTML = '';
    state.members.forEach(m => {
      const currentVal = state.memberWallets[m.id] || 0;
      const newVal = currentVal + stats.perMemberGain;
      list.innerHTML += `
        <div class="gain-item-row">
          <span><strong>${m.name}:</strong> ${formatMoney(currentVal)} → <strong>${formatMoney(newVal)}</strong></span>
          <span class="gain-val">+${formatMoney(stats.perMemberGain)}</span>
        </div>
      `;
    });
  }

  $('#settleModal').classList.add('active');
  lucide.createIcons();
}

function closeSettleModal() { $('#settleModal').classList.remove('active'); }

function confirmSettleWeek() {
  if (!state.isAdmin) return;
  const stats = calculateCurrentWeekStats();

  if (isCurrentWeekClosed()) {
    showToast("Week already settled!", "error");
    closeSettleModal();
    return;
  }

  // 1. Lock current week's transactions
  state.transactions.forEach(t => {
    if (t.date >= stats.currentWeek.startStr && t.date <= stats.currentWeek.endStr) {
      t.weekId = stats.currentWeek.weekId;
      t.settled = true;
    }
  });

  // 2. Update Loss To Recover
  state.lossToRecover = stats.remainingLoss;

  // 3. Update Wallets (Wallets ONLY increase!)
  if (stats.perMemberGain > 0) {
    state.members.forEach(m => {
      state.memberWallets[m.id] = (state.memberWallets[m.id] || 0) + stats.perMemberGain;
    });
  }

  // 4. Create Settlement Record
  const settlementRecord = {
    id: 'settle_' + Date.now(),
    weekId: stats.currentWeek.weekId,
    weekLabel: stats.currentWeek.label,
    startDate: stats.currentWeek.startStr,
    endDate: stats.currentWeek.endStr,
    totalIncome: stats.income,
    totalExpenses: stats.expenses,
    netResult: stats.net,
    previousLossToRecover: stats.prevLoss,
    lossRecoveredThisWeek: stats.lossRecovered,
    remainingLossToRecover: stats.remainingLoss,
    distributableProfit: stats.distributableProfit,
    amountPerMember: stats.perMemberGain,
    walletsSnapshot: { ...state.memberWallets },
    closedAt: new Date().toISOString(),
    status: 'closed'
  };

  state.weeklySettlements = [settlementRecord, ...state.weeklySettlements];

  syncAllFinancialState("Week Settled & Locked!", () => {
    closeSettleModal();
    renderAll();
  });
}

function renderClosedWeeksHistory() {
  const list = $('#closedWeeksList'), empty = $('#emptyClosedWeeksState');
  if (!list) return;
  list.innerHTML = '';

  if (state.weeklySettlements.length === 0) {
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  state.weeklySettlements.forEach((s, idx) => {
    const isWin = s.netResult >= 0;
    list.innerHTML += `
      <div class="settlement-card">
        <div class="settlement-card-header">
          <span class="orbitron" style="font-weight:800;">Week ${state.weeklySettlements.length - idx}: ${s.weekLabel}</span>
          <span class="badge-tag" style="border-color:var(--win); color:var(--win);">CLOSED</span>
        </div>
        <div class="settlement-card-body">
          <div class="settle-row">
            <span>Income / Expense:</span>
            <span><strong class="won-color">${formatMoney(s.totalIncome)}</strong> / <strong class="lost-color">${formatMoney(s.totalExpenses)}</strong></span>
          </div>
          <div class="settle-row">
            <span>Net Result:</span>
            <strong class="orbitron ${isWin ? 'won-color' : 'lost-color'}">${isWin ? '+' : '-'}${formatMoney(s.netResult)}</strong>
          </div>
          <div class="settle-row">
            <span>Loss Recovered:</span>
            <span>${formatMoney(s.lossRecoveredThisWeek)} (Remaining Loss: ${formatMoney(s.remainingLossToRecover)})</span>
          </div>
          <div class="settle-row highlight-row">
            <span>Distributable Profit:</span>
            <strong class="won-color">${formatMoney(s.distributableProfit)} (+${formatMoney(s.amountPerMember)}/member)</strong>
          </div>
        </div>
      </div>
    `;
  });
  lucide.createIcons();
}

// ═══════════════════════════════════════════════════
//  PAYMENT LEDGER ENGINE
// ═══════════════════════════════════════════════════
function openPaymentModal(memberId) {
  if (!state.isAdmin) return;
  const member = state.members.find(m => m.id === memberId);
  if (!member) return;

  $('#payMemberId').value = memberId;
  $('#payMemberNameDisplay').value = `${member.name} (${member.role})`;
  $('#payAmount').value = '';
  $('#payNote').value = '';
  $('#payDate').value = getTodayString();

  const earned = state.memberWallets[memberId] || 0;
  const paid = getMemberPaidAmount(memberId);
  const pending = earned - paid;
  $('#payPendingPreview').textContent = formatMoney(pending);

  $('#paymentModal').classList.add('active');
}

function closePaymentModal() { $('#paymentModal').classList.remove('active'); }

function savePayment(e) {
  e.preventDefault();
  if (!state.isAdmin) return;

  const memberId = $('#payMemberId').value;
  const amount = parseFloat($('#payAmount').value) || 0;
  const date = $('#payDate').value || getTodayString();
  const note = $('#payNote').value.trim();

  if (amount <= 0) return showToast("Invalid payment amount", "error");

  const paymentRecord = {
    id: 'pay_' + Date.now(),
    memberId,
    amount,
    date,
    note,
    timestamp: Date.now()
  };

  state.memberPayments = [paymentRecord, ...state.memberPayments];

  syncAllFinancialState("Payment Recorded!", () => {
    closePaymentModal();
    renderAll();
  });
}

function renderPaymentsLedger() {
  const list = $('#paymentsLedgerList'), empty = $('#emptyPaymentsState');
  if (!list) return;
  list.innerHTML = '';

  if (state.memberPayments.length === 0) {
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  const sorted = [...state.memberPayments].sort((a,b) => b.timestamp - a.timestamp);
  sorted.forEach(p => {
    const member = state.members.find(m => m.id === p.memberId) || { name: 'Unknown' };

    list.innerHTML += `
      <div class="payment-item-card">
        <div class="payment-item-left">
          <div class="payment-member-name">${member.name}</div>
          <div class="payment-ref">${p.date} ${p.note ? `• ${p.note}` : ''}</div>
        </div>
        <div class="payment-amt">${formatMoney(p.amount)}</div>
      </div>
    `;
  });
  lucide.createIcons();
}

// ═══════════════════════════════════════════════════
//  MEMBER NAMES CUSTOMIZATION
// ═══════════════════════════════════════════════════
function openEditMembersModal() {
  if (!state.isAdmin) return;
  $('#nameInputP1').value = state.members[0]?.name || 'Player 1';
  $('#nameInputP2').value = state.members[1]?.name || 'Player 2';
  $('#nameInputP3').value = state.members[2]?.name || 'Player 3';
  $('#nameInputP4').value = state.members[3]?.name || 'Player 4';
  $('#nameInputMgr').value = state.members[4]?.name || 'Manager';
  $('#editMembersModal').classList.add('active');
}

function closeEditMembersModal() { $('#editMembersModal').classList.remove('active'); }

function saveMemberNames(e) {
  e.preventDefault();
  if (!state.isAdmin) return;

  state.members[0].name = $('#nameInputP1').value.trim();
  state.members[1].name = $('#nameInputP2').value.trim();
  state.members[2].name = $('#nameInputP3').value.trim();
  state.members[3].name = $('#nameInputP4').value.trim();
  state.members[4].name = $('#nameInputMgr').value.trim();

  syncAllFinancialState("Call-Signs Updated", () => {
    closeEditMembersModal();
    renderAll();
  });
}

// ═══════════════════════════════════════════════════
//  GRAPH ENGINE
// ═══════════════════════════════════════════════════
function renderFinancialChart() {
  const svg = $('#trendChart'), placeholder = $('#chartPlaceholder');
  if (!svg || !placeholder) return;

  // Build points: weekly settlements + current week
  const stats = calculateCurrentWeekStats();
  const weeks = [...state.weeklySettlements].reverse().map(s => s.netResult);
  weeks.push(stats.net);

  if (weeks.length < 2 && state.transactions.length === 0) {
    svg.style.display = 'none'; placeholder.style.display = 'flex'; return;
  }
  svg.style.display = 'block'; placeholder.style.display = 'none';

  let cum = 0;
  const pts = weeks.map((wVal) => {
    cum += wVal;
    return { val: cum, outcome: wVal >= 0 ? 'win' : 'loss' };
  });

  const W = 600, H = 200, padX = 20, padY = 20;
  const gW = W - padX*2, gH = H - padY*2;
  const vals = [...pts.map(p => p.val), 0];
  let maxV = Math.max(...vals), minV = Math.min(...vals);
  if (maxV === minV) { maxV += 100; minV -= 100; }
  const range = maxV - minV;

  const coords = pts.map((p,i) => ({
    x: padX + (i / Math.max(1, pts.length-1)) * gW,
    y: padY + gH - ((p.val - minV) / range) * gH,
    out: p.outcome
  }));

  const zeroY = padY + gH - ((0 - minV) / range) * gH;

  let html = `
    <defs>
      <linearGradient id="chartGlowGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#00f2fe" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#00f2fe" stop-opacity="0"/>
      </linearGradient>
    </defs>
  `;

  if (zeroY >= padY && zeroY <= padY+gH) html += `<line class="chart-axis-line" x1="${padX}" y1="${zeroY}" x2="${W-padX}" y2="${zeroY}"/>`;

  let dPath = `M ${coords[0].x} ${coords[0].y}`, aPath = `M ${coords[0].x} ${zeroY} L ${coords[0].x} ${coords[0].y}`;
  for (let i=1; i<coords.length; i++) { dPath += ` L ${coords[i].x} ${coords[i].y}`; aPath += ` L ${coords[i].x} ${coords[i].y}`; }
  aPath += ` L ${coords[coords.length-1].x} ${zeroY} Z`;

  html += `<path class="chart-area" d="${aPath}"/><path class="chart-line" d="${dPath}"/>`;
  coords.forEach(p => { html += `<circle class="chart-node ${p.out === 'win' ? 'node-win' : 'node-loss'}" cx="${p.x}" cy="${p.y}" r="4"/>`; });
  svg.innerHTML = html;
}

// ═══════════════════════════════════════════════════
//  TAB 3: PRESERVED OVERALL STANDINGS & MATCHES (REQ 19)
// ═══════════════════════════════════════════════════
function renderStandingsTab() {
  let net = 0, wins = 0, spent = 0, earned = 0;
  state.matches.forEach(m => {
    const p = parseFloat(m.price) || 0;
    spent += p;
    if (m.outcome === 'win') { wins++; earned += (parseFloat(m.wonAmount) || 0); net += ((parseFloat(m.wonAmount) || 0) - p); }
    else { net -= (parseFloat(m.lostAmount) || 0); }
  });

  const total = state.matches.length;
  const winPct = total > 0 ? Math.round((wins / total) * 100) : 0;

  if ($('#standingsTotalProfit')) $('#standingsTotalProfit').textContent = `${net >= 0 ? '' : '-'}${formatMoney(net)}`;
  if ($('#standingsWinRate')) $('#standingsWinRate').textContent = `${winPct}%`;
  if ($('#standingsWinLossRatio')) $('#standingsWinLossRatio').textContent = `${wins}W / ${total - wins}L`;
  if ($('#standingsTotalLobbies')) $('#standingsTotalLobbies').textContent = total;

  // Render Matches List
  const list = $('#matchRegistryList'), empty = $('#emptyMatchState');
  if (!list) return;
  list.innerHTML = '';

  let filtered = [...state.matches].sort((a,b) => b.timestamp - a.timestamp);
  const q = (state.matchSearchText || '').toLowerCase();
  if (q) filtered = filtered.filter(m => (m.map||'').toLowerCase().includes(q) || m.date.includes(q));

  if (filtered.length === 0) { if (empty) empty.style.display = 'flex'; list.style.display = 'none'; return; }
  if (empty) empty.style.display = 'none'; list.style.display = 'flex';

  filtered.forEach(m => {
    const isWin = m.outcome === 'win';
    const buyIn = parseFloat(m.price) || 0;
    const netMatch = isWin ? (parseFloat(m.wonAmount)||0) - buyIn : -(parseFloat(m.lostAmount)||0);

    list.innerHTML += `
      <div class="lobby-card">
        <div class="lobby-card-left">
          <div class="outcome-badge ${isWin ? 'badge-win' : 'badge-loss'}">
            <i data-lucide="${isWin ? 'trophy' : 'skull'}"></i>
          </div>
          <div class="lobby-meta">
            <div class="lobby-time-tag"><i data-lucide="clock"></i>${m.date} ${m.time||''}</div>
            <div class="lobby-tags-row">
              ${isWin ? '<span class="match-tag tag-win">WIN</span>' : '<span class="match-tag tag-loss">LOSS</span>'}
              ${m.map ? `<span class="match-tag tag-map"><i data-lucide="map-pin"></i> ${m.map}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="lobby-card-right">
          <div class="lobby-pricing">
            <span class="lobby-net-profit ${netMatch >= 0 ? 'profit-text' : 'loss-text'}">${netMatch >= 0 ? '+' : ''}${formatMoney(netMatch)}</span>
            <span class="lobby-gross">Entry: ${formatMoney(buyIn)}</span>
          </div>
        </div>
      </div>
    `;
  });

  // Render Roster list if present
  renderRosterList();
  lucide.createIcons();
}

function filterMatches() {
  state.matchSearchText = $('#matchSearchInput')?.value || '';
  renderStandingsTab();
}

function renderRosterList() {
  const list = $('#playersList');
  if (!list) return;
  list.innerHTML = '';
  state.players.forEach(p => {
    const inits = p.name.substring(0,2).toUpperCase();
    list.innerHTML += `
      <div class="player-roster-card" onclick="openPlayerProfile('${p.id}')">
        <div class="player-roster-avatar" style="background:${p.color};">${inits}</div>
        <div class="player-roster-info">
          <div class="player-roster-name">${p.name}</div>
        </div>
      </div>
    `;
  });
}

function openAddLobbyModal() {
  if (!state.isAdmin) return;
  $('#lobbyForm').reset();
  if ($('#editingMatchId')) $('#editingMatchId').value = '';
  $('#lobbyDate').value = getTodayString();
  $('#lobbyModal').classList.add('active');
  toggleOutcomeFields(); calculateNetForm();
}
function closeLobbyModal() { $('#lobbyModal').classList.remove('active'); }
function toggleOutcomeFields() {
  const isWin = $('#outcomeWin').checked;
  $('#moneyWonGroup').style.display = isWin ? 'block' : 'none';
  $('#moneyLostGroup').style.display = isWin ? 'none' : 'block';
}
function calculateNetForm() {
  const p = parseFloat($('#lobbyPrice').value) || 0;
  const isWin = $('#outcomeWin').checked;
  const net = isWin ? (parseFloat($('#moneyWon').value)||0) - p : -(parseFloat($('#moneyLost').value)||0);
  const el = $('#formNetPreview');
  if (el) {
    el.textContent = formatMoney(net);
    el.className = `preview-value orbitron ${net > 0 ? 'positive' : net < 0 ? 'negative' : ''}`;
  }
}
function saveLobby(e) {
  e.preventDefault();
  if (!state.isAdmin) return;
  const isWin = $('#outcomeWin').checked;
  const p = parseFloat($('#lobbyPrice').value) || 0;
  const entry = {
    id: 'm_' + Date.now(),
    timestamp: Date.now(),
    date: $('#lobbyDate').value,
    time: $('#lobbyTime').value,
    map: $('#lobbyMap').value.trim(),
    price: p,
    outcome: isWin ? 'win' : 'loss',
    wonAmount: isWin ? (parseFloat($('#moneyWon').value)||0) : 0,
    lostAmount: !isWin ? (parseFloat($('#moneyLost').value)||0) : p
  };
  state.matches = [entry, ...state.matches];
  cloudSave('matches', state.matches, 'Match Logged!', () => { closeLobbyModal(); renderStandingsTab(); });
}
function openPlayerProfile(id) {
  const p = state.players.find(x => x.id === id);
  if (!p) return;
  if ($('#profileAvatar')) { $('#profileAvatar').style.background = p.color; $('#profileAvatar').textContent = p.name.substring(0,2).toUpperCase(); }
  if ($('#profileName')) $('#profileName').textContent = p.name;
  $('#playerProfileModal').classList.add('active');
}
function closePlayerProfileModal() { $('#playerProfileModal').classList.remove('active'); }

// ═══════════════════════════════════════════════════
//  ADMIN AUTH & PIN KEYPAD
// ═══════════════════════════════════════════════════
let tempPin = '';
function handleAdminBadgeClick() {
  if (state.isAdmin) { state.isAdmin = false; updateAdminUI(); showToast('Session Locked'); }
  else { tempPin = ''; updatePinDots(); $('#pinModal').classList.add('active'); }
}
function closePinModal() { $('#pinModal').classList.remove('active'); }
function pressKey(k) {
  if ($('#pinErrorMessage')) $('#pinErrorMessage').textContent = '';
  if (k === 'clear') { tempPin = ''; updatePinDots(); }
  else if (k === 'submit') submitPin();
  else if (tempPin.length < 4) { tempPin += k; updatePinDots(); if(tempPin.length===4) setTimeout(submitPin, 150); }
}
function handlePinInput(el) { tempPin = el.value.replace(/[^0-9]/g, '').substring(0,4); updatePinDots(); if(tempPin.length===4) setTimeout(submitPin, 150); }
function updatePinDots() {
  $$('.pin-dot').forEach((d,i) => d.classList.toggle('active', i < tempPin.length));
  if ($('#pinInputField')) $('#pinInputField').value = tempPin;
}
function submitPin() {
  if (tempPin === state.adminPIN) {
    state.isAdmin = true; updateAdminUI(); closePinModal(); showToast('Access Granted', 'success');
  } else {
    tempPin = ''; updatePinDots();
    if ($('#pinErrorMessage')) $('#pinErrorMessage').textContent = 'AUTH FAILED';
  }
}
function updateAdminUI() {
  const btn = $('#adminStatusBtn'), txt = $('#adminStatusText'), icn = $('#adminLockIcon');
  if (state.isAdmin) {
    if (btn) btn.classList.add('unlocked');
    if (txt) txt.textContent = 'Manager Mode';
    if (icn) icn.setAttribute('data-lucide', 'unlock');
    $$('.disabled').forEach(el => { el.removeAttribute('disabled'); el.classList.remove('disabled'); });
  } else {
    if (btn) btn.classList.remove('unlocked');
    if (txt) txt.textContent = 'Viewer';
    if (icn) icn.setAttribute('data-lucide', 'lock');
    $('#addTxBtn')?.classList.add('disabled'); $('#addTxBtn')?.setAttribute('disabled', 'true');
    $('#editMembersBtn')?.classList.add('disabled'); $('#editMembersBtn')?.setAttribute('disabled', 'true');
    $('#settleWeekTriggerBtn')?.classList.add('disabled'); $('#settleWeekTriggerBtn')?.setAttribute('disabled', 'true');
    $('#addLobbyBtn')?.classList.add('disabled'); $('#addLobbyBtn')?.setAttribute('disabled', 'true');
    $('#adminSettingsBtn')?.classList.add('disabled'); $('#adminSettingsBtn')?.setAttribute('disabled', 'true');
  }
  lucide.createIcons();
  renderAll();
}

function openAdminSettingsModal() { if (state.isAdmin) $('#settingsModal').classList.add('active'); }
function closeAdminSettingsModal() { $('#settingsModal').classList.remove('active'); }
function changeAdminPin(e) {
  e.preventDefault();
  if (!state.isAdmin) return;
  const c = $('#currentPin').value, n = $('#newPin').value;
  if (c !== state.adminPIN) return $('#pinUpdateStatus').textContent = 'Current PIN invalid';
  if (n.length !== 4) return $('#pinUpdateStatus').textContent = 'PIN must be 4 digits';
  state.adminPIN = n;
  cloudSave('adminPIN', n, 'PIN Updated', () => { $('#pinUpdateStatus').textContent = 'Saved Locally'; });
  $('#currentPin').value = ''; $('#newPin').value = '';
}
function saveFirebaseUrl() {
  if (!state.isAdmin) return;
  let url = $('#firebaseDbInput').value.trim();
  if (!url) return;
  if (!url.endsWith('/')) url += '/';
  localStorage.setItem('ltx_firebase_url', url);
  showToast('Database URL updated! Reconnecting...', 'success');
  setTimeout(() => location.reload(), 1000);
}
function exportData() {
  if (!state.isAdmin) return;
  const data = JSON.stringify(state);
  const a = document.createElement('a');
  a.href = "data:text/json;charset=utf-8," + encodeURIComponent(data);
  a.download = `4IMMORTALS_Backup_${Date.now()}.json`;
  a.click();
}
