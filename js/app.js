// ============================================================
// RENTTRACK PRO — Main App Logic
// ============================================================

// ---- STATE ----
let state = {
  units: {},
  rent: {},
  electricity: {},
  expenses: {},
  maintenance: {},
  payments: {},  // payments[unitId] = [{id, amount, date, note}]
  settings: { elecRate: 8, theme: 'dark' }
};



// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  loadFromLocal();
  initNavigation();
  populateMonthFilters();
  populateYearFilter();
  loadDashboard();
});

window.addEventListener('firebaseReady', () => {
  syncFromFirebase();
});

// ============================================================
// LOCAL STORAGE
// ============================================================
function saveToLocal() {
  localStorage.setItem('renttrack_state', JSON.stringify(state));
}

function loadFromLocal() {
  const saved = localStorage.getItem('renttrack_state');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state = deepMerge(state, parsed);
    } catch(e) { console.error('Local load error', e); }
  }
  applyTheme(state.settings.theme || 'dark');
}

function deepMerge(target, source) {
  const result = {...target};
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ============================================================
// FIREBASE SYNC
// ============================================================
async function syncFromFirebase() {
  try {
    updateSyncStatus('🔄 Syncing...');
    const snap = await window.fsGetDoc(window.fsDoc(window.db, 'renttrack', 'data'));
    if (snap.exists()) {
      const fbData = snap.data();
      state = deepMerge(state, fbData);
      saveToLocal();
    }
    updateSyncStatus('🟢 Synced');
  } catch(e) {
    updateSyncStatus('🔴 Offline');
    console.warn('Firebase sync failed, using local data', e);
  }
}

async function saveToFirebase() {
  try {
    updateSyncStatus('🔄 Saving...');
    await window.fsSetDoc(window.fsDoc(window.db, 'renttrack', 'data'), state);
    updateSyncStatus('🟢 Synced');
  } catch(e) {
    updateSyncStatus('🔴 Offline');
    console.warn('Firebase save failed', e);
  }
}

function updateSyncStatus(msg) {
  const el = document.getElementById('syncStatus');
  if (el) el.textContent = msg;
}

async function saveAll() {
  saveToLocal();
  await saveToFirebase();
}



// ============================================================
// NAVIGATION
// ============================================================
function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      navigateTo(page);
      if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
      }
    });
  });
}

function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');

  const titles = {
    dashboard: 'Dashboard', units: 'Units', rent: 'Rent Collection',
    electricity: 'Electricity', expenses: 'Expenses',
    maintenance: 'Maintenance', ledger: 'Tenant Ledger', reports: 'Reports', settings: 'Settings'
  };
  document.getElementById('pageTitle').textContent = titles[page] || page;

  const loaders = {
    dashboard: loadDashboard,
    units: loadUnitsPage,
    rent: loadRentPage,
    electricity: loadElecPage,
    expenses: loadExpensesPage,
    maintenance: loadMaintPage,
    ledger: loadLedgerPage,
    reports: loadReports,
    settings: loadSettingsPage
  };
  if (loaders[page]) loaders[page]();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ============================================================
// MONTH / YEAR HELPERS
// ============================================================
function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function populateMonthFilters() {
  const months = getLast24Months();
  ['rentMonthFilter', 'elecMonthFilter', 'expMonthFilter', 'reportMonth'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = months.map(m => `<option value="${m}"${m === getCurrentMonth() ? ' selected' : ''}>${formatMonth(m)}</option>`).join('');
  });
}

function populateYearFilter() {
  const el = document.getElementById('reportYear');
  if (!el) return;
  const currentYear = new Date().getFullYear();
  let html = '';
  for (let y = currentYear; y >= currentYear - 5; y--) {
    html += `<option value="${y}"${y === currentYear ? ' selected' : ''}>${y}</option>`;
  }
  el.innerHTML = html;
}

function getLast24Months() {
  const months = [];
  const d = new Date();
  for (let i = 0; i < 24; i++) {
    months.push(d.toISOString().slice(0, 7));
    d.setMonth(d.getMonth() - 1);
  }
  return months;
}

function formatMonth(ym) {
  const [y, m] = ym.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[parseInt(m)-1]} ${y}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================
// DASHBOARD
// ============================================================
function loadDashboard() {
  const units = Object.values(state.units);
  const month = getCurrentMonth();

  const total = units.length;
  const occupied = units.filter(u => u.tenant).length;
  const vacant = total - occupied;

  let income = 0, pending = 0;
  const pendingUnits = [];
  units.forEach(u => {
    if (!u.tenant) return;
    const r = (state.rent[u.id] || {})[month];
    if (r && r.status === 'paid') income += parseFloat(r.amountPaid || u.rent || 0);
    else if (r && r.status === 'partial') { income += parseFloat(r.amountPaid || 0); pending++; pendingUnits.push(u); }
    else { pending++; pendingUnits.push(u); }
  });

  const monthExpenses = Object.values(state.expenses).filter(e => e.date && e.date.startsWith(month));
  const totalExp = monthExpenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-occupied').textContent = occupied;
  document.getElementById('stat-vacant').textContent = vacant;
  document.getElementById('stat-income').textContent = '₹' + income.toLocaleString('en-IN');
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-expenses').textContent = '₹' + totalExp.toLocaleString('en-IN');

  const pl = document.getElementById('pendingList');
  if (pendingUnits.length === 0) {
    pl.innerHTML = '<p class="empty-msg">All rents collected! 🎉</p>';
  } else {
    pl.innerHTML = pendingUnits.map(u => `
      <div class="pending-item">
        <span>${u.name} — ${u.tenant}</span>
        <span style="color:var(--danger)">₹${(u.rent||0).toLocaleString('en-IN')}</span>
      </div>
    `).join('');
  }

  const openMaint = Object.values(state.maintenance).filter(m => m.status !== 'done');
  const ml = document.getElementById('maintenanceAlerts');
  if (openMaint.length === 0) {
    ml.innerHTML = '<p class="empty-msg">No open issues! ✅</p>';
  } else {
    ml.innerHTML = openMaint.slice(0, 5).map(m => `
      <div class="pending-item">
        <span>${m.unit === 'building' ? '🏢' : ''} ${m.desc.slice(0, 40)}</span>
        <span class="status-badge status-${m.status}">${m.status === 'open' ? '🔴' : '🟡'}</span>
      </div>
    `).join('');
  }
}

// ============================================================
// UNITS
// ============================================================
function loadUnitsPage() {
  const container = document.getElementById('unitsList');
  const units = Object.values(state.units);
  if (units.length === 0) {
    container.innerHTML = '<p class="empty-msg" style="grid-column:1/-1">No units added yet. Click "+ Add Unit" to start!</p>';
    return;
  }
  container.innerHTML = units.map(u => unitCard(u)).join('');
  syncMaintUnitDropdown();
}

function unitCard(u) {
  const remarkMap = { good: '👍 Good', average: '😐 Average', problem: '⚠️ Problem' };
  return `
  <div class="unit-card">
    <span class="unit-badge ${u.tenant ? 'badge-occupied' : 'badge-vacant'}">
      ${u.tenant ? '✅ Occupied' : '🔴 Vacant'}
    </span>
    <div class="unit-name">${u.name}</div>
    <div class="unit-type">${u.type || 'Room'}</div>
    ${u.tenant ? `<div class="unit-tenant">👤 ${u.tenant}</div>` : '<div class="unit-tenant" style="opacity:0.4">No tenant</div>'}
    <div class="unit-rent">${u.rent ? '₹' + parseInt(u.rent).toLocaleString('en-IN') + '/mo' : ''}</div>
    ${u.deposit ? `<div style="font-size:0.75rem;color:var(--text2)">🔒 Deposit: ₹${parseInt(u.deposit).toLocaleString('en-IN')}</div>` : ''}
    ${u.moveIn ? `<div style="font-size:0.75rem;color:var(--text2)">📅 Move-in: ${u.moveIn}</div>` : ''}
    ${u.remark ? `<div class="unit-remark">${remarkMap[u.remark] || ''}</div>` : ''}
    ${u.notes ? `<div style="font-size:0.75rem;color:var(--text2);margin-top:0.25rem">📝 ${u.notes}</div>` : ''}
    <div class="unit-actions">
      <button class="btn-sm" onclick="editUnit('${u.id}')">✏️ Edit</button>
      <button class="btn-sm" onclick="showBill('${u.id}')">🧾 Bill</button>
      <button class="btn-danger" onclick="deleteUnit('${u.id}')">🗑️</button>
    </div>
  </div>`;
}

function openUnitModal() {
  openModal('unitModal');
  document.getElementById('unitModalTitle').textContent = 'Add Unit';
  document.getElementById('unitEditId').value = '';
  ['unitName','tenantName','unitRent','moveInDate','unitNotes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('unitType').value = 'Room';
  document.getElementById('tenantRemark').value = '';
  document.getElementById('securityDeposit').value = '';
}

function editUnit(id) {
  const u = state.units[id];
  if (!u) return;
  openModal('unitModal');
  document.getElementById('unitModalTitle').textContent = 'Edit Unit';
  document.getElementById('unitEditId').value = id;
  document.getElementById('unitName').value = u.name || '';
  document.getElementById('unitType').value = u.type || 'Room';
  document.getElementById('tenantName').value = u.tenant || '';
  document.getElementById('unitRent').value = u.rent || '';
  document.getElementById('moveInDate').value = u.moveIn || '';
  document.getElementById('securityDeposit').value = u.deposit || '';
  document.getElementById('unitNotes').value = u.notes || '';
  document.getElementById('tenantRemark').value = u.remark || '';
}

async function saveUnit() {
  const name = document.getElementById('unitName').value.trim();
  if (!name) { showToast('❌ Unit name required'); return; }
  const editId = document.getElementById('unitEditId').value;
  const id = editId || 'unit_' + Date.now();
  state.units[id] = {
    id, name,
    type: document.getElementById('unitType').value,
    tenant: document.getElementById('tenantName').value.trim(),
    rent: document.getElementById('unitRent').value,
    moveIn: document.getElementById('moveInDate').value,
    deposit: document.getElementById('securityDeposit').value,
    notes: document.getElementById('unitNotes').value.trim(),
    remark: document.getElementById('tenantRemark').value
  };
  await saveAll();
  closeModal('unitModal');
  loadUnitsPage();
  showToast('✅ Unit saved!');
}

async function deleteUnit(id) {
  if (!confirm('Delete this unit? All its data will be removed.')) return;
  delete state.units[id];
  delete state.rent[id];
  delete state.electricity[id];
  await saveAll();
  loadUnitsPage();
  showToast('🗑️ Unit deleted');
}

function syncMaintUnitDropdown() {
  const sel = document.getElementById('maintUnit');
  const units = Object.values(state.units);
  sel.innerHTML = '<option value="building">🏢 Building (Common)</option>' +
    units.map(u => `<option value="${u.id}">${u.name}${u.tenant ? ' — ' + u.tenant : ''}</option>`).join('');
}

function syncReportUnitDropdown() {
  const sel = document.getElementById('reportUnit');
  const units = Object.values(state.units);
  sel.innerHTML = '<option value="all">All Units</option>' +
    units.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
}

// ============================================================
// RENT
// ============================================================
function loadRentPage() {
  const month = document.getElementById('rentMonthFilter').value;
  const units = Object.values(state.units).filter(u => u.tenant);
  const container = document.getElementById('rentTable');
  if (units.length === 0) {
    container.innerHTML = '<p class="empty-msg">No occupied units. Add units with tenants first.</p>';
    return;
  }
  container.innerHTML = units.map(u => {
    const r = (state.rent[u.id] || {})[month] || {};
    const status = r.status || 'pending';
    return `
    <div class="rent-row">
      <div class="rent-row-info">
        <div class="rent-unit-name">${u.name} — ${u.type || 'Room'}</div>
        <div class="rent-tenant">👤 ${u.tenant}</div>
        <div class="rent-amount">₹${parseInt(u.rent || 0).toLocaleString('en-IN')}/mo${r.amountPaid ? ' | Paid: ₹' + parseInt(r.amountPaid).toLocaleString('en-IN') : ''}</div>
        ${r.payDate ? `<div style="font-size:0.75rem;color:var(--text2)">📅 ${r.payDate}</div>` : ''}
        ${r.note ? `<div style="font-size:0.75rem;color:var(--text2)">💬 ${r.note}</div>` : ''}
      </div>
      <div class="rent-row-actions">
        <span class="status-badge status-${status}">${statusLabel(status)}</span>
        <button class="btn-sm" onclick="openRentModal('${u.id}', '${month}')">Update</button>
        <button class="btn-sm" onclick="showBill('${u.id}')">🧾 Bill</button>
      </div>
    </div>`;
  }).join('');
}

function statusLabel(s) {
  return s === 'paid' ? '✅ Paid' : s === 'partial' ? '🔶 Partial' : '⏳ Pending';
}

function openRentModal(unitId, month) {
  const u = state.units[unitId];
  const r = (state.rent[unitId] || {})[month] || {};
  document.getElementById('rentModalUnit').textContent = `${u.name} | ${formatMonth(month)} | Rent: ₹${parseInt(u.rent||0).toLocaleString('en-IN')}`;
  document.getElementById('rentStatus').value = r.status || 'pending';
  document.getElementById('rentAmountPaid').value = r.amountPaid || u.rent || '';
  document.getElementById('rentPayDate').value = r.payDate || today();
  document.getElementById('rentNote').value = r.note || '';
  document.getElementById('rentModalUnitId').value = unitId;
  document.getElementById('rentModalMonth').value = month;
  openModal('rentModal');
}

async function saveRent() {
  const unitId = document.getElementById('rentModalUnitId').value;
  const month = document.getElementById('rentModalMonth').value;
  if (!state.rent[unitId]) state.rent[unitId] = {};
  state.rent[unitId][month] = {
    status: document.getElementById('rentStatus').value,
    amountPaid: document.getElementById('rentAmountPaid').value,
    payDate: document.getElementById('rentPayDate').value,
    note: document.getElementById('rentNote').value
  };
  await saveAll();
  closeModal('rentModal');
  loadRentPage();
  showToast('✅ Rent updated!');
}

// ============================================================
// ELECTRICITY
// ============================================================
function loadElecPage() {
  const month = document.getElementById('elecMonthFilter').value;
  const units = Object.values(state.units).filter(u => u.tenant);
  const container = document.getElementById('elecTable');
  if (units.length === 0) {
    container.innerHTML = '<p class="empty-msg">No occupied units.</p>';
    return;
  }
  container.innerHTML = units.map(u => {
    const e = (state.electricity[u.id] || {})[month] || {};
    const consumed = e.newReading && e.oldReading ? (e.newReading - e.oldReading) : null;
    return `
    <div class="rent-row">
      <div class="rent-row-info">
        <div class="rent-unit-name">⚡ ${u.name} — ${u.tenant}</div>
        ${consumed !== null ? `
          <div style="font-size:0.85rem;margin-top:0.25rem">
            Old: ${e.oldReading} → New: ${e.newReading} = <strong>${consumed} units</strong>
          </div>
          <div class="rent-amount">Bill: ₹${(consumed * (e.rate || state.settings.elecRate)).toLocaleString('en-IN')}</div>
        ` : '<div class="rent-amount" style="color:var(--text2)">No reading entered</div>'}
        ${e.status ? `<div style="font-size:0.75rem;color:var(--text2)">Status: ${statusLabel(e.status)}</div>` : ''}
      </div>
      <div class="rent-row-actions">
        ${consumed !== null ? `<span class="status-badge status-${e.status || 'pending'}">${statusLabel(e.status || 'pending')}</span>` : ''}
        <button class="btn-sm" onclick="openElecModal('${u.id}', '${month}')">⚡ Enter Reading</button>
      </div>
    </div>`;
  }).join('');
}

function openElecModal(unitId, month) {
  const u = state.units[unitId];
  const e = (state.electricity[unitId] || {})[month] || {};
  document.getElementById('elecModalUnit').textContent = `${u.name} | ${formatMonth(month)}`;
  document.getElementById('elecOld').value = e.oldReading || '';
  document.getElementById('elecNew').value = e.newReading || '';
  document.getElementById('elecRateInput').value = state.settings.elecRate || 8;
  document.getElementById('elecStatus').value = e.status || 'pending';
  document.getElementById('elecModalUnitId').value = unitId;
  document.getElementById('elecModalMonth').value = month;
  updateElecCalc();
  openModal('elecModal');

  document.getElementById('elecOld').addEventListener('input', updateElecCalc);
  document.getElementById('elecNew').addEventListener('input', updateElecCalc);
}

function updateElecCalc() {
  const oldR = parseFloat(document.getElementById('elecOld').value) || 0;
  const newR = parseFloat(document.getElementById('elecNew').value) || 0;
  const rate = parseFloat(document.getElementById('elecRateInput').value) || 0;
  const consumed = Math.max(0, newR - oldR);
  const bill = consumed * rate;
  document.getElementById('elecUnitsConsumed').textContent = consumed;
  document.getElementById('elecBillAmt').textContent = '₹' + bill.toLocaleString('en-IN');
}

async function saveElec() {
  const unitId = document.getElementById('elecModalUnitId').value;
  const month = document.getElementById('elecModalMonth').value;
  const oldR = parseFloat(document.getElementById('elecOld').value) || 0;
  const newR = parseFloat(document.getElementById('elecNew').value) || 0;
  const rate = parseFloat(document.getElementById('elecRateInput').value) || state.settings.elecRate;
  if (newR < oldR) { showToast('❌ New reading cannot be less than old reading'); return; }
  if (!state.electricity[unitId]) state.electricity[unitId] = {};
  state.electricity[unitId][month] = {
    oldReading: oldR, newReading: newR, rate,
    consumed: newR - oldR, bill: (newR - oldR) * rate,
    status: document.getElementById('elecStatus').value
  };
  await saveAll();
  closeModal('elecModal');
  loadElecPage();
  showToast('✅ Electricity saved!');
}

// ============================================================
// EXPENSES
// ============================================================
function loadExpensesPage() {
  const month = document.getElementById('expMonthFilter').value;
  const expenses = Object.values(state.expenses).filter(e => e.date && e.date.startsWith(month));
  const container = document.getElementById('expensesList');
  const total = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  if (expenses.length === 0) {
    container.innerHTML = '<p class="empty-msg">No expenses this month.</p>';
    return;
  }
  container.innerHTML = `
    <div style="font-size:0.85rem;color:var(--text2);margin-bottom:0.75rem">
      Total: <strong style="color:var(--danger)">₹${total.toLocaleString('en-IN')}</strong>
    </div>
  ` + expenses.sort((a,b) => b.date.localeCompare(a.date)).map(e => `
    <div class="expense-item">
      <div>
        <div class="expense-cat">${e.category}</div>
        <div class="expense-note">${e.note || ''}</div>
        <div class="expense-date">📅 ${e.date}</div>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem">
        <div class="expense-amount">₹${parseFloat(e.amount).toLocaleString('en-IN')}</div>
        <button class="btn-sm" onclick="editExpense('${e.id}')">✏️</button>
        <button class="btn-danger" onclick="deleteExpense('${e.id}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

function editExpense(id) {
  const e = state.expenses[id];
  if (!e) return;
  document.getElementById('expEditId').value = id;
  document.getElementById('expCategory').value = e.category;
  document.getElementById('expAmount').value = e.amount;
  document.getElementById('expDate').value = e.date;
  document.getElementById('expNote').value = e.note || '';
  openModal('expenseModal');
}

async function saveExpense() {
  const amount = document.getElementById('expAmount').value;
  if (!amount) { showToast('❌ Amount required'); return; }
  const editId = document.getElementById('expEditId').value;
  const id = editId || 'exp_' + Date.now();
  state.expenses[id] = {
    id, category: document.getElementById('expCategory').value,
    amount, date: document.getElementById('expDate').value || today(),
    note: document.getElementById('expNote').value
  };
  await saveAll();
  closeModal('expenseModal');
  loadExpensesPage();
  showToast('✅ Expense saved!');
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  delete state.expenses[id];
  await saveAll();
  loadExpensesPage();
  showToast('🗑️ Deleted');
}

// ============================================================
// MAINTENANCE
// ============================================================
function loadMaintPage() {
  const filter = document.getElementById('maintFilter').value;
  let items = Object.values(state.maintenance);
  if (filter !== 'all') items = items.filter(m => m.status === filter);
  const container = document.getElementById('maintList');
  syncMaintUnitDropdown();
  if (items.length === 0) {
    container.innerHTML = '<p class="empty-msg">No maintenance tasks.</p>';
    return;
  }
  const unitName = (id) => id === 'building' ? '🏢 Building' : (state.units[id] ? state.units[id].name : id);
  container.innerHTML = items.sort((a,b) => (b.date||'').localeCompare(a.date||'')).map(m => `
    <div class="maint-item">
      <div>
        <div class="maint-desc">${m.desc}</div>
        <div class="maint-unit">${unitName(m.unit)}</div>
        ${m.date ? `<div class="maint-unit">📅 ${m.date}</div>` : ''}
        ${m.schedule ? `<div class="maint-sched">🗓️ ${m.schedule}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
        <span class="status-badge status-${m.status}">${m.status === 'open' ? '🔴 Open' : m.status === 'inprogress' ? '🟡 In Progress' : '🟢 Done'}</span>
        <button class="btn-sm" onclick="editMaint('${m.id}')">✏️</button>
        <button class="btn-danger" onclick="deleteMaint('${m.id}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

function editMaint(id) {
  const m = state.maintenance[id];
  if (!m) return;
  syncMaintUnitDropdown();
  document.getElementById('maintEditId').value = id;
  document.getElementById('maintUnit').value = m.unit || 'building';
  document.getElementById('maintDesc').value = m.desc || '';
  document.getElementById('maintStatus').value = m.status || 'open';
  document.getElementById('maintDate').value = m.date || '';
  document.getElementById('maintSchedule').value = m.schedule || '';
  openModal('maintModal');
}

async function saveMaint() {
  const desc = document.getElementById('maintDesc').value.trim();
  if (!desc) { showToast('❌ Description required'); return; }
  const editId = document.getElementById('maintEditId').value;
  const id = editId || 'maint_' + Date.now();
  state.maintenance[id] = {
    id, unit: document.getElementById('maintUnit').value,
    desc, status: document.getElementById('maintStatus').value,
    date: document.getElementById('maintDate').value || today(),
    schedule: document.getElementById('maintSchedule').value
  };
  await saveAll();
  closeModal('maintModal');
  loadMaintPage();
  showToast('✅ Maintenance saved!');
}

async function deleteMaint(id) {
  if (!confirm('Delete this task?')) return;
  delete state.maintenance[id];
  await saveAll();
  loadMaintPage();
  showToast('🗑️ Deleted');
}

// ============================================================
// BILL GENERATOR
// ============================================================
function showBill(unitId) {
  const u = state.units[unitId];
  if (!u || !u.tenant) { showToast('❌ No tenant in this unit'); return; }
  const month = getCurrentMonth();
  const r = (state.rent[unitId] || {})[month] || {};
  const e = (state.electricity[unitId] || {})[month] || {};
  const rentAmt = parseFloat(u.rent || 0);
  const elecBill = e.bill ? parseFloat(e.bill) : 0;
  const total = rentAmt + elecBill;

  document.getElementById('billContent').innerHTML = `
    <div style="text-align:center;margin-bottom:1rem">
      <strong style="font-family:Syne,sans-serif;font-size:1.1rem">🏠 RentTrack Pro</strong>
      <div style="font-size:0.8rem;opacity:0.6">Bill for ${formatMonth(month)}</div>
    </div>
    <div style="margin-bottom:0.75rem;font-size:0.85rem">
      <div><strong>Unit:</strong> ${u.name} (${u.type || 'Room'})</div>
      <div><strong>Tenant:</strong> ${u.tenant}</div>
    </div>
    <div class="bill-row"><span>Rent</span><span>₹${rentAmt.toLocaleString('en-IN')}</span></div>
    ${e.bill ? `
      <div class="bill-row">
        <span>Electricity (${e.consumed} units × ₹${e.rate})</span>
        <span>₹${elecBill.toLocaleString('en-IN')}</span>
      </div>` : ''}
    <div class="bill-total"><span>Total Payable</span><span>₹${total.toLocaleString('en-IN')}</span></div>
    ${r.amountPaid ? `<div style="font-size:0.8rem;color:var(--accent2);margin-top:0.5rem">✅ Paid: ₹${parseInt(r.amountPaid).toLocaleString('en-IN')} on ${r.payDate || ''}</div>` : ''}
    ${u.deposit ? `<div style="font-size:0.75rem;color:var(--text2);margin-top:0.25rem">🔒 Security Deposit: ₹${parseInt(u.deposit).toLocaleString('en-IN')}</div>` : ''}
  `;
  openModal('billModal');
}

function printBill() {
  const content = document.getElementById('billContent').innerHTML;
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Bill</title>
    <style>body{font-family:sans-serif;padding:2rem;max-width:400px}
    .bill-row{display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px dashed #ccc}
    .bill-total{display:flex;justify-content:space-between;font-weight:bold;margin-top:0.5rem;font-size:1.05rem}
    </style></head><body>${content}</body></html>`);
  win.print();
}

// ============================================================
// REPORTS
// ============================================================
function loadReports() {
  syncReportUnitDropdown();
  const type = document.getElementById('reportType').value;
  const month = document.getElementById('reportMonth').value;
  const year = document.getElementById('reportYear').value;
  const unitId = document.getElementById('reportUnit').value;
  const container = document.getElementById('reportContent');

  if (type === 'monthly') {
    renderMonthlyReport(container, month);
  } else if (type === 'annual') {
    renderAnnualReport(container, year);
  } else if (type === 'unit') {
    renderUnitReport(container, unitId);
  }
}

function renderMonthlyReport(container, month) {
  const units = Object.values(state.units).filter(u => u.tenant);
  let rentIncome = 0, elecIncome = 0;
  let rentRows = '', elecRows = '';

  units.forEach(u => {
    const r = (state.rent[u.id] || {})[month] || {};
    const e = (state.electricity[u.id] || {})[month] || {};
    const rentPaid = r.status === 'paid' || r.status === 'partial' ? parseFloat(r.amountPaid || 0) : 0;
    rentIncome += rentPaid;
    rentRows += `<div class="report-row"><span>${u.name} — ${u.tenant}</span><span class="status-badge status-${r.status||'pending'}">${statusLabel(r.status||'pending')} ${rentPaid ? '₹'+rentPaid.toLocaleString('en-IN') : ''}</span></div>`;

    if (e.bill) {
      const epaid = e.status === 'paid' ? parseFloat(e.bill) : 0;
      elecIncome += epaid;
      elecRows += `<div class="report-row"><span>⚡ ${u.name}</span><span>${e.consumed} units = ₹${parseFloat(e.bill).toLocaleString('en-IN')} <span class="status-badge status-${e.status||'pending'}">${statusLabel(e.status||'pending')}</span></span></div>`;
    }
  });

  const expenses = Object.values(state.expenses).filter(e => e.date && e.date.startsWith(month));
  const totalExp = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const expRows = expenses.map(e => `<div class="report-row"><span>${e.category} — ${e.note||''}</span><span style="color:var(--danger)">₹${parseFloat(e.amount).toLocaleString('en-IN')}</span></div>`).join('');

  const netProfit = rentIncome + elecIncome - totalExp;
  container.innerHTML = `
    <h3 style="font-family:Syne,sans-serif;margin-bottom:1rem">📊 ${formatMonth(month)}</h3>
    <h4 style="margin:0.75rem 0 0.5rem;opacity:0.7">💰 Rent</h4>
    ${rentRows || '<p class="empty-msg">No rent data</p>'}
    <h4 style="margin:0.75rem 0 0.5rem;opacity:0.7">⚡ Electricity</h4>
    ${elecRows || '<p class="empty-msg">No electricity data</p>'}
    <h4 style="margin:0.75rem 0 0.5rem;opacity:0.7">💸 Expenses</h4>
    ${expRows || '<p class="empty-msg">No expenses</p>'}
    <div class="report-total"><span>Total Expenses</span><span style="color:var(--danger)">₹${totalExp.toLocaleString('en-IN')}</span></div>
    <div class="report-total" style="color:var(--accent2);font-size:1.1rem">
      <span>Net Profit</span><span>₹${netProfit.toLocaleString('en-IN')}</span>
    </div>`;
}

function renderAnnualReport(container, year) {
  let totalIncome = 0, totalExpenses = 0;
  let rows = '';
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2,'0')}`;
    const units = Object.values(state.units).filter(u => u.tenant);
    let mIncome = 0;
    units.forEach(u => {
      const r = (state.rent[u.id] || {})[month] || {};
      if (r.status === 'paid' || r.status === 'partial') mIncome += parseFloat(r.amountPaid || 0);
      const e = (state.electricity[u.id] || {})[month] || {};
      if (e.status === 'paid' && e.bill) mIncome += parseFloat(e.bill);
    });
    const mExp = Object.values(state.expenses).filter(e => e.date && e.date.startsWith(month)).reduce((s,e) => s + parseFloat(e.amount||0), 0);
    totalIncome += mIncome; totalExpenses += mExp;
    rows += `<div class="report-row"><span>${formatMonth(month)}</span><span style="color:var(--accent2)">₹${mIncome.toLocaleString('en-IN')}</span><span style="color:var(--danger)">₹${mExp.toLocaleString('en-IN')}</span><span style="color:${(mIncome-mExp)>=0?'var(--accent2)':'var(--danger)'} ">₹${(mIncome-mExp).toLocaleString('en-IN')}</span></div>`;
  }
  container.innerHTML = `
    <h3 style="font-family:Syne,sans-serif;margin-bottom:1rem">📅 Annual Summary ${year}</h3>
    <div class="report-row" style="font-weight:600;opacity:0.7"><span>Month</span><span>Income</span><span>Expenses</span><span>Profit</span></div>
    ${rows}
    <div class="report-total"><span>Total Income</span><span style="color:var(--accent2)">₹${totalIncome.toLocaleString('en-IN')}</span></div>
    <div class="report-total"><span>Total Expenses</span><span style="color:var(--danger)">₹${totalExpenses.toLocaleString('en-IN')}</span></div>
    <div class="report-total" style="font-size:1.1rem;color:var(--accent2)"><span>Net Profit</span><span>₹${(totalIncome-totalExpenses).toLocaleString('en-IN')}</span></div>`;
}

function renderUnitReport(container, unitId) {
  if (unitId === 'all') {
    container.innerHTML = '<p class="empty-msg">Please select a specific unit for unit-wise report.</p>';
    return;
  }
  const u = state.units[unitId];
  if (!u) { container.innerHTML = '<p class="empty-msg">Unit not found.</p>'; return; }

  const allMonths = getAllMonthsForUnit(unitId);
  let rows = '';
  allMonths.forEach(month => {
    const r = (state.rent[unitId] || {})[month] || {};
    const e = (state.electricity[unitId] || {})[month] || {};
    rows += `
      <div class="report-row">
        <span>${formatMonth(month)}</span>
        <span><span class="status-badge status-${r.status||'pending'}">${statusLabel(r.status||'pending')}</span> ${r.amountPaid ? '₹'+parseInt(r.amountPaid).toLocaleString('en-IN') : ''}</span>
        <span>${e.bill ? '⚡₹'+parseFloat(e.bill).toLocaleString('en-IN') : '-'}</span>
      </div>`;
  });

  container.innerHTML = `
    <h3 style="font-family:Syne,sans-serif;margin-bottom:0.25rem">${u.name} — All Time History</h3>
    <p style="font-size:0.8rem;opacity:0.6;margin-bottom:1rem">Tenant: ${u.tenant || 'Vacant'} | Rent: ₹${parseInt(u.rent||0).toLocaleString('en-IN')}</p>
    <div class="report-row" style="font-weight:600;opacity:0.7"><span>Month</span><span>Rent</span><span>Electricity</span></div>
    ${rows || '<p class="empty-msg">No history found.</p>'}`;
}

function getAllMonthsForUnit(unitId) {
  const months = new Set();
  Object.keys(state.rent[unitId] || {}).forEach(m => months.add(m));
  Object.keys(state.electricity[unitId] || {}).forEach(m => months.add(m));
  getLast24Months().forEach(m => months.add(m));
  return [...months].sort().reverse();
}

// ============================================================
// SETTINGS
// ============================================================
function loadSettingsPage() {
  document.getElementById('elecRate').value = state.settings.elecRate || 8;
  const lb = localStorage.getItem('renttrack_lastbackup');
  document.getElementById('lastBackup').textContent = lb ? new Date(lb).toLocaleString() : 'Never';
}

async function saveSettings() {
  state.settings.elecRate = parseFloat(document.getElementById('elecRate').value) || 8;
  await saveAll();
  showToast('✅ Settings saved!');
}



function setTheme(theme) {
  state.settings.theme = theme;
  applyTheme(theme);
  saveAll();
}

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
}

function toggleDark() {
  const isLight = document.body.classList.contains('light');
  setTheme(isLight ? 'dark' : 'light');
}

// ============================================================
// BACKUP & RESTORE
// ============================================================
function exportBackup() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `renttrack_backup_${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  localStorage.setItem('renttrack_lastbackup', new Date().toISOString());
  showToast('✅ Backup downloaded!');
}

function importBackup() {
  document.getElementById('importFile').click();
}

async function doImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const imported = JSON.parse(text);
    state = deepMerge(state, imported);
    await saveAll();
    showToast('✅ Backup restored!');
    loadDashboard();
  } catch(e) {
    showToast('❌ Invalid backup file');
  }
  event.target.value = '';
}

function exportToGoogleDrive() {
  exportBackup();
  showToast('💡 File downloaded! Now drag it to Google Drive manually.');
}

function exportReportCSV() {
  const type = document.getElementById('reportType').value;
  const month = document.getElementById('reportMonth').value;
  const year = document.getElementById('reportYear').value;
  let csv = '';

  if (type === 'monthly') {
    csv = 'Unit,Tenant,Rent Status,Amount Paid,Electricity Bill\n';
    Object.values(state.units).filter(u => u.tenant).forEach(u => {
      const r = (state.rent[u.id] || {})[month] || {};
      const e = (state.electricity[u.id] || {})[month] || {};
      csv += `"${u.name}","${u.tenant}","${r.status||'pending'}","${r.amountPaid||0}","${e.bill||0}"\n`;
    });
  } else if (type === 'annual') {
    csv = 'Month,Income,Expenses,Profit\n';
    for (let m = 1; m <= 12; m++) {
      const mo = `${year}-${String(m).padStart(2,'0')}`;
      const units = Object.values(state.units).filter(u => u.tenant);
      let inc = 0;
      units.forEach(u => {
        const r = (state.rent[u.id]||{})[mo]||{};
        if (r.status==='paid'||r.status==='partial') inc += parseFloat(r.amountPaid||0);
      });
      const exp = Object.values(state.expenses).filter(e => e.date && e.date.startsWith(mo)).reduce((s,e) => s+parseFloat(e.amount||0),0);
      csv += `"${formatMonth(mo)}","${inc}","${exp}","${inc-exp}"\n`;
    }
  }

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `renttrack_report_${today()}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('✅ CSV exported!');
}

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  const editIds = ['unitEditId','expEditId','maintEditId'];
  editIds.forEach(eid => { const el = document.getElementById(eid); if(el) el.value = ''; });
}

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
  }
});

// ============================================================
// TOAST
// ============================================================
function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), duration);
}

// Expose to HTML
window.openModal = openModal;
window.closeModal = closeModal;
window.saveUnit = saveUnit;
window.editUnit = editUnit;
window.deleteUnit = deleteUnit;
window.openRentModal = openRentModal;
window.saveRent = saveRent;
window.openElecModal = openElecModal;
window.saveElec = saveElec;
window.updateElecCalc = updateElecCalc;
window.saveExpense = saveExpense;
window.editExpense = editExpense;
window.deleteExpense = deleteExpense;
window.saveMaint = saveMaint;
window.editMaint = editMaint;
window.deleteMaint = deleteMaint;
window.showBill = showBill;
window.printBill = printBill;
window.loadRentPage = loadRentPage;
window.loadElecPage = loadElecPage;
window.loadExpensesPage = loadExpensesPage;
window.loadMaintPage = loadMaintPage;
window.loadReports = loadReports;
window.saveSettings = saveSettings;
window.setTheme = setTheme;
window.toggleDark = toggleDark;
window.exportBackup = exportBackup;
window.importBackup = importBackup;
window.doImport = doImport;
window.exportToGoogleDrive = exportToGoogleDrive;
window.exportReportCSV = exportReportCSV;
window.toggleSidebar = toggleSidebar;

// ============================================================
// LEDGER
// ============================================================

function syncLedgerUnitDropdown() {
  const sel = document.getElementById('ledgerUnitSelect');
  const units = Object.values(state.units).filter(u => u.tenant);
  sel.innerHTML = '<option value="">-- Select Unit --</option>' +
    units.map(u => `<option value="${u.id}">${u.name} — ${u.tenant}</option>`).join('');
}

function loadLedgerPage() {
  syncLedgerUnitDropdown();
  const unitId = document.getElementById('ledgerUnitSelect').value;
  const container = document.getElementById('ledgerContent');

  if (!unitId) {
    container.innerHTML = '<p class="empty-msg" style="margin-top:2rem">Unit select karo upar se 👆</p>';
    return;
  }

  const u = state.units[unitId];
  if (!u || !u.tenant) {
    container.innerHTML = '<p class="empty-msg">Is unit mein koi tenant nahi.</p>';
    return;
  }

  // --- Calculate months from move-in to today ---
  const moveIn = u.moveIn ? new Date(u.moveIn) : null;
  const today = new Date();
  let totalMonths = 0;
  let moveInLabel = 'N/A';

  if (moveIn) {
    // Full months (Option A — poora mahina count)
    const y1 = moveIn.getFullYear(), m1 = moveIn.getMonth();
    const y2 = today.getFullYear(), m2 = today.getMonth();
    totalMonths = (y2 - y1) * 12 + (m2 - m1) + 1; // +1 to include current month
    if (totalMonths < 1) totalMonths = 1;
    moveInLabel = moveIn.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  }

  const rentPerMonth = parseFloat(u.rent || 0);
  const totalRentDue = totalMonths * rentPerMonth;

  // --- Electricity bills total ---
  const elecData = state.electricity[unitId] || {};
  const totalElec = Object.values(elecData).reduce((sum, e) => sum + parseFloat(e.bill || 0), 0);

  // --- Total Due ---
  const totalDue = totalRentDue + totalElec;

  // --- Payments ---
  const payments = (state.payments[unitId] || []).sort((a, b) => a.date.localeCompare(b.date));
  const totalReceived = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

  // --- Balance ---
  const balance = totalDue - totalReceived;

  // --- Monthly breakdown ---
  const monthlyRows = buildMonthlyBreakdown(unitId, moveIn, today, rentPerMonth);

  container.innerHTML = `
    <!-- Tenant Info -->
    <div class="ledger-section" style="margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem">
        <div>
          <div style="font-family:Syne,sans-serif;font-size:1.1rem;font-weight:700">${u.name} — ${u.tenant}</div>
          <div style="font-size:0.82rem;color:var(--text2);margin-top:0.2rem">
            📅 Move-in: ${moveInLabel} &nbsp;|&nbsp; 🏠 ${u.type || 'Room'} &nbsp;|&nbsp; ₹${rentPerMonth.toLocaleString('en-IN')}/mo
          </div>
        </div>
        <button class="btn-primary" onclick="openPaymentModal('${unitId}')">+ Add Payment</button>
      </div>
    </div>

    <!-- Balance Box -->
    <div class="ledger-balance-box ${balance <= 0 ? 'clear' : 'danger'}">
      <div class="balance-label">${balance <= 0 ? '✅ All Clear!' : '⚠️ Balance Remaining (Tu Lena Hai)'}</div>
      <div class="balance-amount">₹${Math.abs(balance).toLocaleString('en-IN')}</div>
      <div class="balance-sub">${balance <= 0 ? 'Tenant ne poora pay kar diya!' : `₹${totalDue.toLocaleString('en-IN')} due - ₹${totalReceived.toLocaleString('en-IN')} received`}</div>
    </div>

    <!-- Summary Stats -->
    <div class="ledger-summary">
      <div class="ledger-stat">
        <div class="ledger-stat-num" style="color:var(--text2)">${totalMonths}</div>
        <div class="ledger-stat-label">Months</div>
      </div>
      <div class="ledger-stat">
        <div class="ledger-stat-num" style="color:var(--accent)">₹${totalRentDue.toLocaleString('en-IN')}</div>
        <div class="ledger-stat-label">Total Rent Due</div>
      </div>
      <div class="ledger-stat">
        <div class="ledger-stat-num" style="color:var(--info)">₹${totalElec.toLocaleString('en-IN')}</div>
        <div class="ledger-stat-label">Electricity Total</div>
      </div>
      <div class="ledger-stat">
        <div class="ledger-stat-num" style="color:var(--danger)">₹${totalDue.toLocaleString('en-IN')}</div>
        <div class="ledger-stat-label">Grand Total Due</div>
      </div>
      <div class="ledger-stat">
        <div class="ledger-stat-num" style="color:var(--accent2)">₹${totalReceived.toLocaleString('en-IN')}</div>
        <div class="ledger-stat-label">Total Received</div>
      </div>
      <div class="ledger-stat">
        <div class="ledger-stat-num" style="color:${balance > 0 ? 'var(--danger)' : 'var(--accent2)'}">₹${Math.abs(balance).toLocaleString('en-IN')}</div>
        <div class="ledger-stat-label">${balance > 0 ? 'Balance Due' : 'Overpaid'}</div>
      </div>
    </div>

    <!-- Monthly Rent Breakdown -->
    <div class="ledger-section">
      <h3>📅 Monthly Rent Breakdown</h3>
      ${monthlyRows}
    </div>

    <!-- Electricity Bills -->
    <div class="ledger-section">
      <h3>⚡ Electricity Bills</h3>
      ${Object.keys(elecData).length === 0
        ? '<p class="empty-msg">Koi electricity bill nahi.</p>'
        : Object.entries(elecData).sort((a,b) => a[0].localeCompare(b[0])).map(([month, e]) => `
          <div class="ledger-row">
            <span><span class="month-chip">${formatMonth(month)}</span> &nbsp; ${e.consumed} units × ₹${e.rate}</span>
            <span style="color:var(--info);font-weight:600">₹${parseFloat(e.bill).toLocaleString('en-IN')}</span>
          </div>`).join('')
      }
      ${totalElec > 0 ? `<div class="ledger-row" style="font-weight:700;margin-top:0.25rem"><span>Total Electricity</span><span style="color:var(--info)">₹${totalElec.toLocaleString('en-IN')}</span></div>` : ''}
    </div>

    <!-- Payments Received -->
    <div class="ledger-section">
      <h3>💵 Payments Received</h3>
      ${payments.length === 0
        ? '<p class="empty-msg">Koi payment record nahi.</p>'
        : payments.map(p => `
          <div class="ledger-row">
            <div>
              <div style="font-weight:500">₹${parseFloat(p.amount).toLocaleString('en-IN')}</div>
              <div style="font-size:0.75rem;color:var(--text2)">📅 ${p.date}${p.note ? ' • ' + p.note : ''}</div>
            </div>
            <div style="display:flex;gap:0.5rem;align-items:center">
              <span style="color:var(--accent2);font-weight:700">₹${parseFloat(p.amount).toLocaleString('en-IN')}</span>
              <button class="btn-sm" onclick="editPayment('${unitId}', '${p.id}')">✏️</button>
              <button class="btn-danger" onclick="deletePayment('${unitId}', '${p.id}')">🗑️</button>
            </div>
          </div>`).join('')
      }
      ${payments.length > 0 ? `<div class="ledger-row" style="font-weight:700;margin-top:0.25rem"><span>Total Received</span><span style="color:var(--accent2)">₹${totalReceived.toLocaleString('en-IN')}</span></div>` : ''}
    </div>

    <!-- Final Calculation -->
    <div class="ledger-section">
      <h3>🧮 Final Calculation</h3>
      <div class="ledger-row"><span>Total Rent (${totalMonths} months × ₹${rentPerMonth.toLocaleString('en-IN')})</span><span>₹${totalRentDue.toLocaleString('en-IN')}</span></div>
      <div class="ledger-row"><span>⚡ Electricity Total</span><span>₹${totalElec.toLocaleString('en-IN')}</span></div>
      <div class="ledger-row" style="font-weight:700"><span>Grand Total Due</span><span style="color:var(--danger)">₹${totalDue.toLocaleString('en-IN')}</span></div>
      <div class="ledger-row"><span>💵 Total Received</span><span style="color:var(--accent2)">₹${totalReceived.toLocaleString('en-IN')}</span></div>
      <div class="ledger-row" style="font-weight:800;font-size:1rem;color:${balance > 0 ? 'var(--danger)' : 'var(--accent2)'}">
        <span>${balance > 0 ? '⚠️ Balance Tu Lega' : '✅ Overpaid by'}</span>
        <span>₹${Math.abs(balance).toLocaleString('en-IN')}</span>
      </div>
    </div>

    <button class="btn-secondary" onclick="exportLedgerCSV('${unitId}')" style="margin-top:0.5rem">📥 Export Ledger CSV</button>
  `;
}

function buildMonthlyBreakdown(unitId, moveIn, today, rentPerMonth) {
  if (!moveIn) return '<p class="empty-msg">Move-in date set nahi hai.</p>';
  const rows = [];
  const d = new Date(moveIn.getFullYear(), moveIn.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth(), 1);

  while (d <= end) {
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const r = (state.rent[unitId] || {})[ym] || {};
    const status = r.status || 'pending';
    rows.push(`
      <div class="ledger-row">
        <span><span class="month-chip">${formatMonth(ym)}</span></span>
        <span>₹${rentPerMonth.toLocaleString('en-IN')}</span>
        <span class="status-badge status-${status}">${statusLabel(status)}</span>
      </div>`);
    d.setMonth(d.getMonth() + 1);
  }
  return rows.join('');
}

// --- Payment CRUD ---
function openPaymentModal(unitId) {
  const u = state.units[unitId];
  document.getElementById('paymentModalUnit').textContent = `${u.name} — ${u.tenant}`;
  document.getElementById('paymentAmount').value = '';
  document.getElementById('paymentDate').value = new Date().toISOString().slice(0,10);
  document.getElementById('paymentNote').value = '';
  document.getElementById('paymentUnitId').value = unitId;
  document.getElementById('paymentEditId').value = '';
  openModal('paymentModal');
}

function editPayment(unitId, payId) {
  const p = (state.payments[unitId] || []).find(x => x.id === payId);
  if (!p) return;
  const u = state.units[unitId];
  document.getElementById('paymentModalUnit').textContent = `${u.name} — ${u.tenant}`;
  document.getElementById('paymentAmount').value = p.amount;
  document.getElementById('paymentDate').value = p.date;
  document.getElementById('paymentNote').value = p.note || '';
  document.getElementById('paymentUnitId').value = unitId;
  document.getElementById('paymentEditId').value = payId;
  openModal('paymentModal');
}

async function savePayment() {
  const unitId = document.getElementById('paymentUnitId').value;
  const amount = document.getElementById('paymentAmount').value;
  if (!amount) { showToast('❌ Amount daalo'); return; }
  const editId = document.getElementById('paymentEditId').value;

  if (!state.payments[unitId]) state.payments[unitId] = [];

  if (editId) {
    const idx = state.payments[unitId].findIndex(x => x.id === editId);
    if (idx > -1) {
      state.payments[unitId][idx] = {
        id: editId, amount,
        date: document.getElementById('paymentDate').value,
        note: document.getElementById('paymentNote').value
      };
    }
  } else {
    state.payments[unitId].push({
      id: 'pay_' + Date.now(), amount,
      date: document.getElementById('paymentDate').value,
      note: document.getElementById('paymentNote').value
    });
  }

  await saveAll();
  closeModal('paymentModal');
  loadLedgerPage();
  showToast('✅ Payment saved!');
}

async function deletePayment(unitId, payId) {
  if (!confirm('Delete this payment?')) return;
  state.payments[unitId] = (state.payments[unitId] || []).filter(p => p.id !== payId);
  await saveAll();
  loadLedgerPage();
  showToast('🗑️ Payment deleted');
}

function exportLedgerCSV(unitId) {
  const u = state.units[unitId];
  const payments = state.payments[unitId] || [];
  const elecData = state.electricity[unitId] || {};

  const moveIn = u.moveIn ? new Date(u.moveIn) : new Date();
  const today = new Date();
  const y1 = moveIn.getFullYear(), m1 = moveIn.getMonth();
  const y2 = today.getFullYear(), m2 = today.getMonth();
  const totalMonths = (y2 - y1) * 12 + (m2 - m1) + 1;
  const rentPerMonth = parseFloat(u.rent || 0);
  const totalRentDue = totalMonths * rentPerMonth;
  const totalElec = Object.values(elecData).reduce((s, e) => s + parseFloat(e.bill || 0), 0);
  const totalDue = totalRentDue + totalElec;
  const totalReceived = payments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const balance = totalDue - totalReceived;

  let csv = `Ledger for ${u.name} - ${u.tenant}\n`;
  csv += `Move-in,${u.moveIn}\nRent/month,${rentPerMonth}\nTotal Months,${totalMonths}\n\n`;
  csv += `Total Rent Due,${totalRentDue}\nTotal Electricity,${totalElec}\nGrand Total Due,${totalDue}\n`;
  csv += `Total Received,${totalReceived}\nBalance,${balance}\n\n`;
  csv += `Payments\nDate,Amount,Note\n`;
  payments.forEach(p => { csv += `${p.date},${p.amount},"${p.note || ''}"\n`; });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ledger_${u.name}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('✅ Ledger exported!');
}

window.loadLedgerPage = loadLedgerPage;
window.openPaymentModal = openPaymentModal;
window.editPayment = editPayment;
window.savePayment = savePayment;
window.deletePayment = deletePayment;
window.exportLedgerCSV = exportLedgerCSV;
