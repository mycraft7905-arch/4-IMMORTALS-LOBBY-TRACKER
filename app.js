// ═══════════════════════════════════════════════════
//  LOBBY TRACKER V3.2 — app.js
//  Hardcore Analytics & 24h Lock Engine
// ═══════════════════════════════════════════════════

// ── Core State ──
let state = {
  matches: [],
  players: [],
  adminPIN: '0852',
  isAdmin: false,
  activeFilterTab: 'all',
  searchText: '',
  activeTab: 'dashboard'
};

// ── Firebase ──
const DEFAULT_FIREBASE_DB_URL = "https://lobby-tracker-d128d-default-rtdb.firebaseio.com/";
let firebaseApp = null;
let dbRef = null;

// ── DOM Utilities ──
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);
const getTodayString = () => new Date().toISOString().split('T')[0];

// ═══════════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  try {
    // Load local state
    state.adminPIN = localStorage.getItem('ltx_pin') || '0852';
    state.matches = JSON.parse(localStorage.getItem('ltx_matches') || '[]');
    state.players = JSON.parse(localStorage.getItem('ltx_players') || '[]');

    if ($('#lobbyDate')) $('#lobbyDate').value = getTodayString();

    updateTime();
    setInterval(updateTime, 60000);

    // Initialize 3D Tilt
    if (typeof VanillaTilt !== 'undefined') {
      VanillaTilt.init($$("[data-tilt]"), {
        max: 5, speed: 400, glare: true, "max-glare": 0.2
      });
    }

    // Color picker preview
    $('#newPlayerColor')?.addEventListener('input', (e) => {
      if ($('#colorPreviewSpan')) $('#colorPreviewSpan').style.background = e.target.value;
    });

    renderAll();
    initFirebase();
    
    // Hide Loader
    setTimeout(() => {
      $('#appLoader').classList.remove('active');
      $('#mainAppShell').style.display = 'flex';
      lucide.createIcons();
    }, 800);

  } catch(e) { console.error("Init Error:", e); }
});

function renderAll() {
  renderDashboard();
  renderPlayersTab();
}

// ═══════════════════════════════════════════════════
//  FIREBASE & AUTH
// ═══════════════════════════════════════════════════
function initFirebase() {
  const dbUrl = localStorage.getItem('ltx_firebase_url') || DEFAULT_FIREBASE_DB_URL;
  if ($('#firebaseDbInput')) {
    $('#firebaseDbInput').value = localStorage.getItem('ltx_firebase_url') || '';
    $('#firebaseDbInput').placeholder = DEFAULT_FIREBASE_DB_URL;
  }

  if (firebaseApp) { try { firebaseApp.delete(); } catch(e){} }

  setSyncStatus('syncing', 'Sync Initializing');

  try {
    firebaseApp = firebase.initializeApp({ databaseURL: dbUrl }, 'LTXV3_' + Date.now());
    const database = firebase.database(firebaseApp);
    dbRef = database.ref();

    database.ref('.info/connected').on('value', snap => {
      setSyncStatus(snap.val() ? 'online' : 'offline', snap.val() ? 'Sync Active' : 'Offline Mode');
    });

    dbRef.child('adminPIN').on('value', snap => { if (snap.val()) state.adminPIN = snap.val(); });
    dbRef.child('matches').on('value', snap => { 
      state.matches = snap.val() || []; 
      localStorage.setItem('ltx_matches', JSON.stringify(state.matches)); 
      renderDashboard(); 
    });
    dbRef.child('players').on('value', snap => { 
      state.players = snap.val() || []; 
      localStorage.setItem('ltx_players', JSON.stringify(state.players)); 
      renderPlayersTab();
      renderDashboard(); 
    });

    // Auth Listener for Admin features
    try {
      firebase.auth(firebaseApp).onAuthStateChanged((user) => {
        state.isAdmin = user && !user.isAnonymous;
        updateAdminUI();
      });
    } catch(e){}

  } catch(err) {
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
    dbRef.child(path).set(data).then(() => showToast(successMsg, 'success')).catch(() => localFallback());
  } else { localFallback(); }
}

// ═══════════════════════════════════════════════════
//  NAVIGATION & UTILS
// ═══════════════════════════════════════════════════
function switchTab(tab) {
  state.activeTab = tab;
  $$('.tab-panel').forEach(p => p.classList.remove('active'));
  $(`#panel${tab.charAt(0).toUpperCase() + tab.slice(1)}`)?.classList.add('active');
  
  $$('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
  const btnMap = { dashboard: 'bnDashboard', players: 'bnPlayers' };
  $(`#${btnMap[tab]}`)?.classList.add('active');

  renderAll();
  lucide.createIcons();
}

function updateTime() {
  const now = new Date();
  if ($('.date')) $('.date').textContent = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if ($('.time-badge')) $('.time-badge').textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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

function formatMoney(amount) { return `₹${Math.abs(amount).toFixed(2)}`; }
function convertTo24Hour(timeStr) {
  if (!timeStr) return '00:00';
  const m = timeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return '00:00';
  let h = parseInt(m[1]), min = m[2], ap = m[3].toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2,'0')}:${min}`;
}

function getPlayerDetails(id) {
  return state.players.find(p => p.id === id) || { name: 'Unknown', color: '#666' };
}

function isMatchEditable(m) {
  if (!m) return false;
  if (m.timestamp) return (Date.now() - m.timestamp) < 86400000;
  if (m.date) {
    const matchDate = new Date(`${m.date} ${convertTo24Hour(m.time)}`);
    return (Date.now() - matchDate.getTime()) < 86400000;
  }
  return true;
}

// ═══════════════════════════════════════════════════
//  DASHBOARD & MATCHES
// ═══════════════════════════════════════════════════
function renderDashboard() {
  let net = 0, wins = 0, spent = 0, earned = 0;
  state.matches.forEach(m => {
    const p = parseFloat(m.price) || 0;
    spent += p;
    if (m.outcome === 'win') { wins++; earned += (parseFloat(m.wonAmount) || 0); net += ((parseFloat(m.wonAmount) || 0) - p); }
    else { net -= (parseFloat(m.lostAmount) || 0); }
  });

  const total = state.matches.length;
  const winPct = total > 0 ? Math.round((wins / total) * 100) : 0;

  if ($('#totalProfit')) $('#totalProfit').textContent = `${net >= 0 ? '' : '-'}${formatMoney(net)}`;
  if ($('#winRate')) $('#winRate').textContent = `${winPct}%`;
  if ($('#winLossRatio')) $('#winLossRatio').textContent = `${wins}W / ${total - wins}L`;
  if ($('#totalLobbies')) $('#totalLobbies').textContent = total;
  if ($('#totalEarnings')) $('#totalEarnings').textContent = formatMoney(earned);
  if ($('#totalBuyins')) $('#totalBuyins').textContent = formatMoney(spent);

  renderChart();

  const list = $('#lobbyList'), empty = $('#emptyListState');
  if (!list) return;
  list.innerHTML = '';
  
  let filtered = [...state.matches].sort((a,b) => new Date(`${b.date} ${convertTo24Hour(b.time)}`) - new Date(`${a.date} ${convertTo24Hour(a.time)}`));
  if (state.activeFilterTab === 'win') filtered = filtered.filter(m => m.outcome === 'win');
  else if (state.activeFilterTab === 'loss') filtered = filtered.filter(m => m.outcome === 'loss');

  const q = state.searchText.toLowerCase();
  if (q) filtered = filtered.filter(m => (m.map||'').toLowerCase().includes(q) || m.date.includes(q) || (m.participants||[]).some(pid => getPlayerDetails(pid).name.toLowerCase().includes(q)));

  if (filtered.length === 0) { if (empty) empty.style.display = 'flex'; list.style.display = 'none'; return; }
  if (empty) empty.style.display = 'none'; list.style.display = 'flex';

  const grouped = {};
  filtered.forEach(m => {
    if (!grouped[m.date]) grouped[m.date] = [];
    grouped[m.date].push(m);
  });

  for (const [dateStr, matches] of Object.entries(grouped)) {
    const dateObj = new Date(dateStr + 'T00:00:00');
    let sessionNet = 0;
    matches.forEach(m => {
      const p = parseFloat(m.price) || 0;
      sessionNet += m.outcome === 'win' ? ((parseFloat(m.wonAmount)||0) - p) : -(parseFloat(m.lostAmount)||0);
    });

    const sessionHeader = `
      <div class="session-header">
        <span class="session-date">${dateObj.toLocaleDateString('en-US',{weekday:'long', month:'short', day:'numeric'})}</span>
        <span class="session-net ${sessionNet >= 0 ? 'profit-text' : 'loss-text'}">${sessionNet >= 0 ? '+' : ''}${formatMoney(sessionNet)}</span>
      </div>
    `;
    list.innerHTML += sessionHeader;

    matches.forEach(m => {
      const isWin = m.outcome === 'win';
      const buyIn = parseFloat(m.price) || 0;
      const netMatch = isWin ? (parseFloat(m.wonAmount)||0) - buyIn : -(parseFloat(m.lostAmount)||0);
      
      let lineupHtml = '';
      let mistakesHtml = '';
      if (m.participants && m.participants.length > 0) {
        lineupHtml = `<div class="match-lineup-avatars">`;
        m.participants.forEach(pid => {
          const pData = getPlayerDetails(pid);
          const inits = pData.name.substring(0,2).toUpperCase();
          
          let profitBadge = '';
          if (m.manualProfit && m.manualProfit[pid] !== undefined) {
            const v = m.manualProfit[pid];
            profitBadge = `<span class="mini-profit-badge ${v >= 0 ? 'profit-text' : 'loss-text'}">${v >= 0 ? '+' : ''}${v}</span>`;
          }
          
          lineupHtml += `
            <div class="mini-avatar-wrapper">
              <div class="mini-avatar" style="background:${pData.color};" title="${pData.name}">${inits}</div>
              ${profitBadge}
            </div>
          `;
          
          if (m.mistakes && m.mistakes[pid]) {
            mistakesHtml += `<div class="match-mistake-note"><span style="color:${pData.color}">${pData.name}:</span> ${m.mistakes[pid]}</div>`;
          }
        });
        lineupHtml += `</div>`;
        if (mistakesHtml) mistakesHtml = `<div class="match-mistakes-container">${mistakesHtml}</div>`;
      }

      list.innerHTML += `
        <div class="lobby-card">
          <div class="lobby-card-left">
            <div class="outcome-badge ${isWin ? 'badge-win' : 'badge-loss'}">
              <i data-lucide="${isWin ? 'trophy' : 'skull'}"></i>
            </div>
            <div class="lobby-meta">
              <div class="lobby-time-tag"><i data-lucide="clock"></i>${m.time}</div>
              <div class="lobby-tags-row">
                ${isWin ? '<span class="match-tag tag-win">WIN</span>' : '<span class="match-tag tag-loss">LOSS</span>'}
                ${m.map ? `<span class="match-tag tag-map"><i data-lucide="map"></i> ${m.map}</span>` : ''}
              </div>
              ${lineupHtml}
              ${mistakesHtml}
            </div>
          </div>
          <div class="lobby-card-right">
            <div class="lobby-pricing">
              <span class="lobby-net-profit ${netMatch >= 0 ? 'profit-text' : 'loss-text'}">${netMatch >= 0 ? '+' : ''}${formatMoney(netMatch)}</span>
              <span class="lobby-gross">Entry: ${formatMoney(buyIn)}</span>
            </div>
            ${(() => {
              if (!state.isAdmin) return '';
              if (isMatchEditable(m)) {
                return `
                  <button class="action-btn edit-btn" onclick="editLobby('${m.id}')" title="Edit Match"><i data-lucide="edit-3"></i></button>
                  <button class="action-btn delete-btn" onclick="deleteLobby('${m.id}')" title="Delete Match"><i data-lucide="trash-2"></i></button>
                `;
              } else {
                return `<span class="locked-match-tag" title="Locked after 24h"><i data-lucide="lock"></i> Locked</span>`;
              }
            })()}
          </div>
        </div>
      `;
    });
  }
  lucide.createIcons();
}

function setFilterTab(tab) {
  state.activeFilterTab = tab;
  $$('.filter-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === tab));
  renderDashboard();
}

function filterLobbies() { state.searchText = $('#searchInput').value; renderDashboard(); }

// ═══════════════════════════════════════════════════
//  CHART ENGINE
// ═══════════════════════════════════════════════════
function renderChart() {
  const svg = $('#trendChart'), p = $('#chartPlaceholder');
  if (!svg || !p) return;
  if (state.matches.length < 2) { svg.style.display = 'none'; p.style.display = 'flex'; return; }
  svg.style.display = 'block'; p.style.display = 'none';

  const sorted = [...state.matches].sort((a,b) => new Date(`${a.date} ${convertTo24Hour(a.time)}`) - new Date(`${b.date} ${convertTo24Hour(b.time)}`));
  let cum = 0;
  const pts = sorted.map(m => {
    if (m.outcome === 'win') cum += (parseFloat(m.wonAmount)||0) - (parseFloat(m.price)||0);
    else cum -= parseFloat(m.lostAmount)||0;
    return { val: cum, outcome: m.outcome };
  });
  
  const W = 600, H = 200, padX = 20, padY = 20;
  const gW = W - padX*2, gH = H - padY*2;
  const vals = [...pts.map(p => p.val), 0];
  let maxV = Math.max(...vals), minV = Math.min(...vals);
  if (maxV === minV) { maxV+=10; minV-=10; }
  const range = maxV - minV;
  
  const coords = pts.map((p,i) => ({
    x: padX + (i / (pts.length-1)) * gW,
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
//  MATCH LOGGING & EDITING
// ═══════════════════════════════════════════════════
function openAddLobbyModal() {
  if (!state.isAdmin) return;
  $('#lobbyForm').reset();
  if ($('#editingMatchId')) $('#editingMatchId').value = '';
  if ($('#lobbyModalTitle')) $('#lobbyModalTitle').textContent = 'Log Match';
  $('#lobbyDate').value = getTodayString();
  
  const selector = $('#lineupSelector');
  if (state.players.length === 0) {
    selector.innerHTML = `<p class="hint-text">Add players to Roster first.</p>`;
  } else {
    selector.innerHTML = '';
    state.players.forEach(p => {
      selector.innerHTML += `
        <label class="lineup-check-btn">
          <input type="checkbox" name="matchParticipants" value="${p.id}" checked onchange="renderMistakeInputs()">
          <span class="lineup-check-chip" style="border-color:${p.color};">
            <div class="chip-dot" style="background:${p.color}"></div>
            ${p.name}
          </span>
        </label>
      `;
    });
  }

  renderMistakeInputs();
  $('#lobbyModal').classList.add('active');
  toggleOutcomeFields(); calculateNetForm();
}

function renderMistakeInputs() {
  const container = $('#mistakesContainer'), list = $('#mistakesList');
  const checked = $$('input[name="matchParticipants"]:checked');
  if (checked.length === 0) { container.style.display = 'none'; return; }
  
  container.style.display = 'block';
  list.innerHTML = '';
  checked.forEach(cb => {
    const p = getPlayerDetails(cb.value);
    list.innerHTML += `
      <div class="mistake-input-row">
        <span class="mistake-player-label" style="color:${p.color}">${p.name}</span>
        <div class="mistake-inputs-flex">
          <input type="text" class="mistake-input flex-2" data-pid="${p.id}" placeholder="Notes/Mistakes" autocomplete="off">
          <input type="number" class="manual-profit-input flex-1" data-pid="${p.id}" placeholder="Net ₹ (e.g. 50, -20)">
        </div>
      </div>
    `;
  });
}

function closeLobbyModal() { $('#lobbyModal').classList.remove('active'); }

function toggleOutcomeFields() {
  const isWin = $('#outcomeWin').checked;
  $('#moneyWonGroup').style.display = isWin ? 'flex' : 'none';
  $('#moneyLostGroup').style.display = isWin ? 'none' : 'flex';
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
  
  const editId = $('#editingMatchId')?.value;
  const isEditing = !!editId;

  const participants = [];
  const mistakes = {};
  const manualProfit = {};
  $$('input[name="matchParticipants"]:checked').forEach(cb => {
    participants.push(cb.value);
  });
  $$('.mistake-input').forEach(inp => {
    const val = inp.value.trim();
    if (val) mistakes[inp.dataset.pid] = val;
  });
  $$('.manual-profit-input').forEach(inp => {
    const val = parseFloat(inp.value);
    if (!isNaN(val)) manualProfit[inp.dataset.pid] = val;
  });

  const entry = {
    id: isEditing ? editId : ('m_' + Date.now()),
    timestamp: isEditing ? (state.matches.find(m=>m.id===editId)?.timestamp || Date.now()) : Date.now(),
    date: $('#lobbyDate').value,
    time: $('#lobbyTime').value,
    map: $('#lobbyMap').value.trim(),
    participants: participants,
    mistakes: mistakes,
    manualProfit: manualProfit,
    price: p,
    outcome: isWin ? 'win' : 'loss',
    wonAmount: isWin ? (parseFloat($('#moneyWon').value)||0) : 0,
    lostAmount: !isWin ? (parseFloat($('#moneyLost').value)||0) : p
  };
  
  let updated;
  if (isEditing) {
    updated = state.matches.map(m => m.id === editId ? entry : m);
  } else {
    updated = [entry, ...state.matches];
  }

  const saveLocal = () => { state.matches = updated; localStorage.setItem('ltx_matches', JSON.stringify(updated)); renderDashboard(); };
  cloudSave('matches', updated, isEditing ? 'Match updated!' : 'Match logged!', saveLocal);
  closeLobbyModal();
}

function editLobby(id) {
  if (!state.isAdmin) return;
  const m = state.matches.find(match => match.id === id);
  if (!m) return;
  if (!isMatchEditable(m)) return showToast('Match locked after 24 hours', 'error');

  if ($('#editingMatchId')) $('#editingMatchId').value = m.id;
  if ($('#lobbyModalTitle')) $('#lobbyModalTitle').textContent = 'Edit Match';

  $('#lobbyDate').value = m.date || getTodayString();
  $('#lobbyTime').value = m.time || '12:00 PM';
  $('#lobbyMap').value = m.map || '';
  $('#lobbyPrice').value = m.price || 0;

  if (m.outcome === 'win') {
    $('#outcomeWin').checked = true;
    $('#moneyWon').value = m.wonAmount || 0;
  } else {
    $('#outcomeLoss').checked = true;
    $('#moneyLost').value = m.lostAmount || 0;
  }

  const selector = $('#lineupSelector');
  selector.innerHTML = '';
  state.players.forEach(p => {
    const isChecked = (m.participants || []).includes(p.id);
    selector.innerHTML += `
      <label class="lineup-check-btn">
        <input type="checkbox" name="matchParticipants" value="${p.id}" ${isChecked ? 'checked' : ''} onchange="renderMistakeInputs()">
        <span class="lineup-check-chip" style="border-color:${p.color};">
          <div class="chip-dot" style="background:${p.color}"></div>
          ${p.name}
        </span>
      </label>
    `;
  });

  renderMistakeInputs();

  if (m.mistakes) {
    $$('.mistake-input').forEach(inp => {
      if (m.mistakes[inp.dataset.pid]) inp.value = m.mistakes[inp.dataset.pid];
    });
  }
  if (m.manualProfit) {
    $$('.manual-profit-input').forEach(inp => {
      if (m.manualProfit[inp.dataset.pid] !== undefined) inp.value = m.manualProfit[inp.dataset.pid];
    });
  }

  toggleOutcomeFields();
  calculateNetForm();
  $('#lobbyModal').classList.add('active');
  lucide.createIcons();
}

function deleteLobby(id) {
  const m = state.matches.find(match => match.id === id);
  if (!m) return;
  if (!isMatchEditable(m)) return showToast('Match locked after 24 hours', 'error');
  if (!state.isAdmin || !confirm('Delete Match?')) return;
  const updated = state.matches.filter(match => match.id !== id);
  cloudSave('matches', updated, 'Match deleted', () => { state.matches = updated; localStorage.setItem('ltx_matches', JSON.stringify(updated)); renderDashboard(); });
}

// ═══════════════════════════════════════════════════
//  PLAYERS & PROFILES
// ═══════════════════════════════════════════════════
function renderPlayersTab() {
  const list = $('#playersList'), empty = $('#emptyPlayersState');
  if ($('#playerCountBadge')) $('#playerCountBadge').textContent = `${state.players.length} Operators`;
  if (!list) return;
  list.innerHTML = '';
  
  if (state.players.length === 0) { if (empty) empty.style.display = 'flex'; return; }
  if (empty) empty.style.display = 'none';

  state.players.forEach(p => {
    const inits = p.name.substring(0,2).toUpperCase();
    const matchesPlayed = state.matches.filter(m => m.participants && m.participants.includes(p.id)).length;

    list.innerHTML += `
      <div class="player-roster-card" onclick="openPlayerProfile('${p.id}')">
        <div class="player-roster-avatar" style="background:${p.color};box-shadow:0 0 15px ${p.color}80;">${inits}</div>
        <div class="player-roster-info">
          <div class="player-roster-name">${p.name}</div>
          <div class="player-roster-meta">${matchesPlayed} matches</div>
        </div>
      </div>
    `;
  });
  lucide.createIcons();
}

function addPlayer() {
  if (!state.isAdmin) return;
  const name = $('#newPlayerName').value.trim();
  if (!name) return;
  const updated = [...state.players, { id: 'p_'+Date.now(), name, color: $('#newPlayerColor').value }];
  cloudSave('players', updated, 'Player recruited', () => { state.players = updated; localStorage.setItem('ltx_players', JSON.stringify(updated)); renderPlayersTab(); });
  $('#newPlayerName').value = '';
}

function removePlayer(id) {
  if (!state.isAdmin || !confirm('Remove player from roster?')) return;
  const updated = state.players.filter(p => p.id !== id);
  cloudSave('players', updated, 'Player removed', () => { state.players = updated; localStorage.setItem('ltx_players', JSON.stringify(updated)); renderPlayersTab(); closePlayerProfileModal(); });
}

function openPlayerProfile(id) {
  const player = getPlayerDetails(id);
  if (player.name === 'Unknown') return;

  if ($('#profileAvatar')) {
    $('#profileAvatar').style.background = player.color;
    $('#profileAvatar').style.boxShadow = `0 0 20px ${player.color}`;
    $('#profileAvatar').textContent = player.name.substring(0,2).toUpperCase();
  }
  if ($('#profileName')) $('#profileName').textContent = player.name;

  const pMatches = state.matches.filter(m => m.participants && m.participants.includes(id));
  const totalPlayed = pMatches.length;
  let wins = 0, profit = 0;

  pMatches.forEach(m => {
    if (m.outcome === 'win') wins++;
    
    if (m.manualProfit && m.manualProfit[id] !== undefined) {
      profit += m.manualProfit[id];
    } else {
      const p = parseFloat(m.price) || 0;
      if (m.outcome === 'win') {
        profit += (parseFloat(m.wonAmount) || 0) - p;
      } else {
        profit -= (parseFloat(m.lostAmount) || 0);
      }
    }
  });

  const winPct = totalPlayed > 0 ? Math.round((wins / totalPlayed) * 100) : 0;
  
  if ($('#profileWinRate')) {
    $('#profileWinRate').textContent = `${winPct}%`;
    $('#profileWinRate').style.color = winPct >= 50 ? 'var(--win)' : 'var(--loss)';
  }
  if ($('#profileWL')) $('#profileWL').textContent = `${wins}W / ${totalPlayed - wins}L`;
  if ($('#profileMatches')) $('#profileMatches').textContent = `${totalPlayed} Matches`;
  if ($('#profileProfit')) {
    $('#profileProfit').textContent = `${profit >= 0 ? '+' : '-'}${formatMoney(profit)}`;
    $('#profileProfit').style.color = profit >= 0 ? 'var(--win)' : 'var(--loss)';
  }

  let recentMistakes = '';
  pMatches.forEach(m => {
    if (m.mistakes && m.mistakes[id]) {
      recentMistakes += `<div class="profile-mistake-item"><span class="mistake-date">${m.date}</span> ${m.mistakes[id]}</div>`;
    }
  });

  const actionsContainer = $('#profileAdminActions');
  let html = '';
  if (recentMistakes) {
    html += `
      <div class="profile-mistakes-section glass-card" style="margin-top:1rem; padding:1rem; text-align:left;">
        <h4 style="font-size:0.75rem; color:var(--amber); margin-bottom:0.5rem;"><i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;"></i> Recent Mistakes</h4>
        ${recentMistakes}
      </div>
    `;
  }

  if (state.isAdmin) {
    html += `
      <button class="btn btn-danger w-full mt-3" onclick="removePlayer('${id}')">
        <i data-lucide="user-minus"></i> Remove from Roster
      </button>
    `;
  }
  if (actionsContainer) actionsContainer.innerHTML = html;

  $('#playerProfileModal').classList.add('active');
  lucide.createIcons();
}

function closePlayerProfileModal() {
  $('#playerProfileModal').classList.remove('active');
}

// ═══════════════════════════════════════════════════
//  ADMIN AUTH & SETTINGS
// ═══════════════════════════════════════════════════
let tempPin = '';
function handleAdminBadgeClick() {
  if (state.isAdmin) { state.isAdmin = false; updateAdminUI(); showToast('Locked'); }
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
    const dots = $('.pin-dots');
    if (dots) { dots.style.animation = 'none'; dots.offsetHeight; dots.style.animation = 'shake 0.3s ease'; }
  }
}

function handleAdminLogout() {
  state.isAdmin = false;
  updateAdminUI();
  showToast('Secure Session Ended');
  closeAdminSettingsModal();
}

function updateAdminUI() {
  const btn = $('#adminStatusBtn'), txt = $('#adminStatusText'), icn = $('#adminLockIcon');
  if (state.isAdmin) {
    if (btn) btn.classList.add('unlocked');
    if (txt) txt.textContent = 'Admin Mode';
    if (icn) icn.setAttribute('data-lucide', 'unlock');
    $$('.disabled').forEach(el => { el.removeAttribute('disabled'); el.classList.remove('disabled'); });
  } else {
    if (btn) btn.classList.remove('unlocked');
    if (txt) txt.textContent = 'Viewer';
    if (icn) icn.setAttribute('data-lucide', 'lock');
    $('#addLobbyBtn')?.classList.add('disabled'); $('#addLobbyBtn')?.setAttribute('disabled', 'true');
    $('#adminSettingsBtn')?.classList.add('disabled'); $('#adminSettingsBtn')?.setAttribute('disabled', 'true');
    $('#addPlayerBtn')?.classList.add('disabled'); $('#addPlayerBtn')?.setAttribute('disabled', 'true');
  }
  lucide.createIcons();
  renderDashboard(); renderPlayersTab();
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
  cloudSave('adminPIN', n, 'PIN Updated', () => { localStorage.setItem('ltx_pin', n); $('#pinUpdateStatus').textContent = 'Saved Locally'; });
  $('#currentPin').value = ''; $('#newPin').value = '';
}

function exportData() {
  if (!state.isAdmin) return;
  const data = JSON.stringify({ app: 'LTX_V3', matches: state.matches, players: state.players });
  const a = document.createElement('a');
  a.href = "data:text/json;charset=utf-8," + encodeURIComponent(data);
  a.download = `LTX_V3_Backup_${Date.now()}.json`;
  a.click();
}

function clearAllData() {
  if (!state.isAdmin || !confirm('DANGER: Wipe all data?')) return;
  state.matches = [];
  cloudSave('matches', [], 'Matches wiped', () => { localStorage.removeItem('ltx_matches'); renderDashboard(); });
  closeAdminSettingsModal();
}
