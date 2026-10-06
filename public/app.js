/* =========================================================
   VOLTAGE SENSOR & MOTOR MONITORING API - DASHBOARD APP JS
   ========================================================= */

// Dynamic API Base URL for PHP or Node
const isPhpEnv = window.location.pathname.endsWith('.php') || window.location.href.includes('.php') || !window.location.port || window.location.port === '80' || window.location.port === '8080';

// Helper function to build API endpoint URL
function getApiUrl(type, id = null) {
  const isPhp = window.location.pathname.endsWith('.php') || window.location.href.includes('api.php') || isPhpEnv;
  if (isPhp) {
    if (type === 'voltage-logs') return `api.php?endpoint=voltage-logs` + (id ? `&id=${id}` : '');
    if (type === 'devices') return `api.php?endpoint=devices` + (id ? `&id=${id}` : '');
    if (type === 'simulate') return `api.php?endpoint=simulate`;
    if (type === 'stats') return `api.php?endpoint=stats`;
    return `api.php?endpoint=${type}`;
  } else {
    if (type === 'voltage-logs') return `http://localhost:5000/api/voltage-logs` + (id ? `/${id}` : '');
    if (type === 'devices') return `http://localhost:5000/api/devices` + (id ? `/${id}` : '');
    if (type === 'simulate') return `http://localhost:5000/api/voltage-logs/simulate`;
    if (type === 'stats') return `http://localhost:5000/api/stats`;
    return `http://localhost:5000/api/${type}`;
  }
}

// Application State
let state = {
  devices: [],
  logs: [],
  filteredLogs: [],
  selectedDatePreset: 'all',
  viewMode: 'latest', // 'latest' = 1 row per motor updated in-place, 'history' = all DB history
  chartInstance: null
};

// DOM Elements
const serverBadge = document.getElementById('serverBadge');
const kpiDevicesCount = document.getElementById('kpiDevicesCount');
const kpiPowerOnCount = document.getElementById('kpiPowerOnCount');
const kpiPowerOffCount = document.getElementById('kpiPowerOffCount');
const kpiLogsCount = document.getElementById('kpiLogsCount');
const kpiLastUpdate = document.getElementById('kpiLastUpdate');

const postEndpointText = document.getElementById('postEndpointText');
const jsonPayloadCode = document.getElementById('jsonPayloadCode');
const curlCommandCode = document.getElementById('curlCommandCode');
const apiPlayground = document.getElementById('apiPlayground');
const btnTogglePlayground = document.getElementById('btnTogglePlayground');
const testMacSelect = document.getElementById('testMacSelect');

const filterForm = document.getElementById('filterForm');
const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const filterMacSelect = document.getElementById('filterMac');
const filterStatusSelect = document.getElementById('filterStatus');
const searchInput = document.getElementById('searchInput');
const filterSummaryText = document.getElementById('filterSummaryText');

const logsTableBody = document.getElementById('logsTableBody');
const tableRecordCount = document.getElementById('tableRecordCount');
const noLogsMessage = document.getElementById('noLogsMessage');

// Modal Elements
const modalDevice = document.getElementById('modalDevice');
const btnClickDevice = document.getElementById('btnClickDevice');
const btnCloseDeviceModal = document.getElementById('btnCloseDeviceModal');
const formAddDevice = document.getElementById('formAddDevice');
const devMacAddress = document.getElementById('devMacAddress');
const devMotorId = document.getElementById('devMotorId');
const btnGenMotorId = document.getElementById('btnGenMotorId');
const devLocation = document.getElementById('devLocation');
const devDeviceType = document.getElementById('devDeviceType');
const devThreshold = document.getElementById('devThreshold');
const registeredDevicesGrid = document.getElementById('registeredDevicesGrid');

const modalChart = document.getElementById('modalChart');
const btnCloseChartModal = document.getElementById('btnCloseChartModal');
const chartModalTitle = document.getElementById('chartModalTitle');

const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initApp();
  setupEventListeners();
  
  // Auto-refresh telemetry logs every 2 seconds for live ESP32 updates!
  setInterval(async () => {
    await fetchLogs();
  }, 2000);
});

// Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem('voltage_app_theme') || 'light';
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('voltage_app_theme', theme);
  
  const btnThemeToggle = document.getElementById('btnThemeToggle');
  if (btnThemeToggle) {
    if (theme === 'light') {
      btnThemeToggle.innerHTML = '<i class="fa-solid fa-moon"></i> Dark Theme';
    } else {
      btnThemeToggle.innerHTML = '<i class="fa-solid fa-sun"></i> Light Theme';
    }
  }
}

// Initialize Application
async function initApp() {
  await fetchDevices();
  await fetchLogs();
  updateStats();
}

// Format MAC Address to use hyphens '-' (e.g. 00-1B-44-11-3A-B7)
function formatMac(mac) {
  if (!mac) return '00-00-00-00-00-00';
  const clean = mac.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (clean.length === 12) {
    return clean.match(/.{1,2}/g).join('-');
  }
  return mac.trim().replace(/:/g, '-').toUpperCase();
}

// Format Motor ID to display cleanly as 'Motor 1', 'Motor 2' instead of raw numbers '1', '2'
function formatMotorId(motorId) {
  if (!motorId) return 'Motor 1';
  const str = String(motorId).trim();
  if (/^\d+$/.test(str)) {
    return `Motor ${str}`;
  }
  const match = str.match(/^motor\s*(\d+)$/i);
  if (match) {
    return `Motor ${match[1]}`;
  }
  return str;
}

// MAC Input Auto-Formatter for hyphens '-'
devMacAddress.addEventListener('input', (e) => {
  let val = e.target.value.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (val.length > 12) val = val.slice(0, 12);
  let formatted = '';
  for (let i = 0; i < val.length; i++) {
    if (i > 0 && i % 2 === 0) formatted += '-';
    formatted += val[i];
  }
  e.target.value = formatted;
});

// Auto generate Motor ID
btnGenMotorId.addEventListener('click', () => {
  const rand = Math.floor(1000 + Math.random() * 9000);
  devMotorId.value = `MTR-${rand}`;
});

// Setup Event Listeners
function setupEventListeners() {
  // Theme Toggle Button
  const btnThemeToggle = document.getElementById('btnThemeToggle');
  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      applyTheme(newTheme);
      showToast(`Switched to ${newTheme.toUpperCase()} theme!`);
    });
  }

  // Navigation / Modal triggers
  btnClickDevice.addEventListener('click', () => {
    openDeviceModal();
  });

  btnCloseDeviceModal.addEventListener('click', () => {
    modalDevice.style.display = 'none';
  });

  btnCloseChartModal.addEventListener('click', () => {
    modalChart.style.display = 'none';
  });

  // Modal close handlers
  const modalEditLog = document.getElementById('modalEditLog');
  const btnCloseEditModal = document.getElementById('btnCloseEditModal');
  if (btnCloseEditModal) {
    btnCloseEditModal.addEventListener('click', () => {
      modalEditLog.style.display = 'none';
    });
  }

  window.addEventListener('click', (e) => {
    if (e.target === modalDevice) modalDevice.style.display = 'none';
    if (e.target === modalChart) modalChart.style.display = 'none';
    if (e.target === modalEditLog) modalEditLog.style.display = 'none';
  });

  // Edit Log Form Submit
  const formEditLog = document.getElementById('formEditLog');
  if (formEditLog) {
    formEditLog.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('editLogId').value;
      const mac = document.getElementById('editMacAddress').value.trim();
      const mId = document.getElementById('editMotorId').value.trim();
      const loc = document.getElementById('editLocation').value.trim();
      const volt = parseFloat(document.getElementById('editVoltage').value);
      const ts = document.getElementById('editTimestamp').value.trim();
      const stat = document.getElementById('editStatus').value;

      try {
        const updateUrl = getApiUrl('voltage-logs', id) + (isPhpEnv ? '&action=update' : '');
        const res = await fetch(updateUrl, {
          method: isPhpEnv ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: id,
            macAddress: mac,
            motorId: mId,
            location: loc,
            voltage: volt,
            timestamp: ts,
            status: stat
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Voltage record updated successfully!');
          modalEditLog.style.display = 'none';
          await fetchLogs();
        } else {
          showToast(data.error || 'Failed to update record', 'error');
        }
      } catch (err) {
        showToast('Network error updating record', 'error');
      }
    });
  }

  // Toggle API Playground
  btnTogglePlayground.addEventListener('click', () => {
    const isHidden = apiPlayground.style.display === 'none';
    apiPlayground.style.display = isHidden ? 'flex' : 'none';
    btnTogglePlayground.innerHTML = isHidden 
      ? '<i class="fa-solid fa-chevron-up"></i> Hide API Playground' 
      : '<i class="fa-solid fa-code"></i> Toggle API Playground & Payload';
  });

  // Copy buttons
  document.getElementById('btnCopyApiLink').addEventListener('click', () => {
    const targetUrl = window.location.href.replace(/index\.php.*/, '') + getApiUrl('voltage-logs');
    copyToClipboard(targetUrl, 'POST API Link copied to clipboard!');
  });

  document.getElementById('btnCopyPayloadJson').addEventListener('click', () => {
    copyToClipboard(jsonPayloadCode.textContent, 'JSON Payload copied to clipboard!');
  });

  document.getElementById('btnCopyCurl').addEventListener('click', () => {
    copyToClipboard(curlCommandCode.textContent, 'cURL command copied to clipboard!');
  });

  // Quick POST button in navbar
  document.getElementById('btnQuickPost').addEventListener('click', () => {
    apiPlayground.style.display = 'flex';
    btnTogglePlayground.innerHTML = '<i class="fa-solid fa-chevron-up"></i> Hide API Playground';
    document.querySelector('.api-banner-card').scrollIntoView({ behavior: 'smooth' });
  });

  // Test POST request from playground
  document.getElementById('formSendPostTest').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mac = testMacSelect.value;
    const voltage = parseFloat(document.getElementById('testVoltageInput').value);

    try {
      const res = await fetch(getApiUrl('voltage-logs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ macAddress: mac, voltage: voltage })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`⚡ POST Success! Status: ${data.log.status}`);
        const resultBox = document.getElementById('testPostResult');
        resultBox.style.display = 'block';
        resultBox.innerHTML = `✅ HTTP 201 Created: ${JSON.stringify(data.log, null, 2)}`;
        await fetchLogs();
      } else {
        showToast(`Error: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast(`Network error communicating with API`, 'error');
    }
  });

  // Device Registration Form Submit
  formAddDevice.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mac = devMacAddress.value.trim();
    const loc = devLocation.value.trim();
    const devType = devDeviceType.value;
    const mId = devMotorId.value.trim();
    const thresh = devThreshold.value;

    if (!mac) {
      showToast('Please enter a MAC Address', 'error');
      return;
    }

    try {
      const res = await fetch(getApiUrl('devices'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          macAddress: mac,
          location: loc,
          deviceType: devType,
          motorId: mId,
          voltageThreshold: thresh
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Device ${data.device.macAddress} registered & Motor ${data.device.motorId} bound!`);
        devMacAddress.value = '';
        devLocation.value = '';
        devMotorId.value = '';
        modalDevice.style.display = 'none';
        
        // Reset MAC & Status filters so the new MAC address is immediately visible in the table!
        filterMacSelect.value = 'ALL';
        filterStatusSelect.value = 'ALL';
        
        await fetchDevices();
        await fetchLogs();
        renderDevicesModalList();
      } else {
        showToast(data.error, 'error');
      }
    } catch (err) {
      showToast('Failed to save device', 'error');
    }
  });

  // Date Filter Preset Chips
  document.querySelectorAll('.date-preset-chips .chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      document.querySelectorAll('.date-preset-chips .chip').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      const preset = e.target.dataset.preset;
      applyDatePreset(preset);
    });
  });

  // Filter Form Submit
  filterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    applyFilters();
  });

  // Filter inputs live trigger
  filterMacSelect.addEventListener('change', applyFilters);
  filterStatusSelect.addEventListener('change', applyFilters);
  startDateInput.addEventListener('change', () => {
    setActiveChip(null);
    applyFilters();
  });
  endDateInput.addEventListener('change', () => {
    setActiveChip(null);
    applyFilters();
  });
  searchInput.addEventListener('input', applyFilters);

  document.getElementById('btnResetFilters').addEventListener('click', () => {
    startDateInput.value = '';
    endDateInput.value = '';
    filterMacSelect.value = 'ALL';
    filterStatusSelect.value = 'ALL';
    searchInput.value = '';
    setActiveChip('all');
    applyFilters();
    showToast('Filters reset to show all date logs');
  });

  // Simulate Random Reading
  document.getElementById('btnSimulateRandom').addEventListener('click', async () => {
    try {
      const res = await fetch(getApiUrl('simulate'), { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`Simulated POST: ${data.log.macAddress} is ${data.log.status} (${data.log.voltage}V)`);
        await fetchLogs();
      }
    } catch (e) {
      showToast('Simulation failed', 'error');
    }
  });

  // Export CSV
  document.getElementById('btnExportCsv').addEventListener('click', exportLogsCsv);

  // View Mode Toggle (Live Motors In-Place vs Full DB History)
  const btnViewLatestMotors = document.getElementById('btnViewLatestMotors');
  const btnViewAllHistory = document.getElementById('btnViewAllHistory');
  if (btnViewLatestMotors && btnViewAllHistory) {
    btnViewLatestMotors.addEventListener('click', () => {
      state.viewMode = 'latest';
      btnViewLatestMotors.className = 'btn btn-sm btn-primary';
      btnViewAllHistory.className = 'btn btn-sm btn-outline';
      applyFilters();
      showToast('Switched to Live Motors view (1 row per motor updated in-place)');
    });

    btnViewAllHistory.addEventListener('click', () => {
      state.viewMode = 'history';
      btnViewAllHistory.className = 'btn btn-sm btn-primary';
      btnViewLatestMotors.className = 'btn btn-sm btn-outline';
      applyFilters();
      showToast('Switched to Full Database Log History');
    });
  }
}

// Fetch Devices
async function fetchDevices() {
  try {
    const res = await fetch(getApiUrl('devices'));
    const data = await res.json();
    if (data.success) {
      state.devices = data.devices;
      populateDeviceDropdowns();
      kpiDevicesCount.textContent = state.devices.length;
    }
  } catch (err) {
    console.error('Error fetching devices:', err);
  }
}

// Fetch Voltage Logs
async function fetchLogs() {
  try {
    const res = await fetch(getApiUrl('voltage-logs'));
    const data = await res.json();
    if (data.success) {
      state.logs = data.logs;
      applyFilters();
      updateStats();
    }
  } catch (err) {
    console.error('Error fetching logs:', err);
  }
}

// Populate Dropdowns
function populateDeviceDropdowns() {
  testMacSelect.innerHTML = state.devices.map(d => 
    `<option value="${d.macAddress}">${d.macAddress} (${formatMotorId(d.motorId)} - ${d.location})</option>`
  ).join('');

  filterMacSelect.innerHTML = '<option value="ALL">All Devices &amp; MACs</option>' + 
    state.devices.map(d => `<option value="${d.macAddress}">${d.macAddress} | ${formatMotorId(d.motorId)}</option>`).join('');
}

// Date Presets Logic
function applyDatePreset(preset) {
  state.selectedDatePreset = preset;
  const today = new Date();
  
  const formatDateForInput = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  if (preset === 'all') {
    startDateInput.value = '';
    endDateInput.value = '';
  } else if (preset === 'today') {
    startDateInput.value = formatDateForInput(today);
    endDateInput.value = formatDateForInput(today);
  } else if (preset === 'yesterday') {
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    startDateInput.value = formatDateForInput(yest);
    endDateInput.value = formatDateForInput(yest);
  } else if (preset === '7days') {
    const d7 = new Date(today);
    d7.setDate(d7.getDate() - 6);
    startDateInput.value = formatDateForInput(d7);
    endDateInput.value = formatDateForInput(today);
  } else if (preset === '30days') {
    const d30 = new Date(today);
    d30.setDate(d30.getDate() - 29);
    startDateInput.value = formatDateForInput(d30);
    endDateInput.value = formatDateForInput(today);
  } else if (preset === 'thisMonth') {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    startDateInput.value = formatDateForInput(firstDay);
    endDateInput.value = formatDateForInput(today);
  }

  applyFilters();
}

function setActiveChip(presetName) {
  document.querySelectorAll('.date-preset-chips .chip').forEach(c => {
    if (presetName && c.dataset.preset === presetName) {
      c.classList.add('active');
    } else {
      c.classList.remove('active');
    }
  });
}

// Helper for browser-safe ISO date parsing
function parseLogDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  const cleanStr = String(dateStr).trim().replace(' ', 'T');
  const d = new Date(cleanStr);
  if (!isNaN(d.getTime())) return d;
  const fallback = new Date(String(dateStr).replace(/-/g, '/'));
  return isNaN(fallback.getTime()) ? null : fallback;
}

// Filter & Render Telemetry Logs
function applyFilters() {
  const startDate = startDateInput.value;
  const endDate = endDateInput.value;
  const selectedMac = filterMacSelect.value;
  const selectedStatus = filterStatusSelect.value;
  const query = searchInput.value.trim().toLowerCase();

  let rawLogs = [...state.logs];

  // Date filtering with safe parser
  if (startDate) {
    const startD = parseLogDate(startDate);
    if (startD) {
      const startMs = new Date(startD).setHours(0, 0, 0, 0);
      rawLogs = rawLogs.filter(l => {
        const logD = parseLogDate(l.timestamp);
        return logD ? logD.getTime() >= startMs : true;
      });
    }
  }
  if (endDate) {
    const endD = parseLogDate(endDate);
    if (endD) {
      const endMs = new Date(endD).setHours(23, 59, 59, 999);
      rawLogs = rawLogs.filter(l => {
        const logD = parseLogDate(l.timestamp);
        return logD ? logD.getTime() <= endMs : true;
      });
    }
  }

  // MAC Address filtering
  if (selectedMac && selectedMac !== 'ALL') {
    rawLogs = rawLogs.filter(l => l.macAddress === selectedMac);
  }

  // Status filtering
  if (selectedStatus && selectedStatus !== 'ALL') {
    rawLogs = rawLogs.filter(l => l.status === selectedStatus);
  }

  // Search query
  if (query) {
    rawLogs = rawLogs.filter(l => 
      l.macAddress.toLowerCase().includes(query) ||
      l.motorId.toLowerCase().includes(query) ||
      l.location.toLowerCase().includes(query) ||
      l.status.toLowerCase().includes(query) ||
      String(l.voltage).includes(query) ||
      l.timestamp.includes(query)
    );
  }

  // Live Motors View Mode (Default): Deduplicate by motorId to show 1 live row per motor updated in-place on screen
  if (state.viewMode === 'latest') {
    const latestMap = {};
    rawLogs.forEach(l => {
      const key = (l.motorId && l.motorId.trim()) ? l.motorId.trim().toLowerCase() : l.macAddress;
      if (!latestMap[key]) {
        latestMap[key] = l;
      }
    });
    rawLogs = Object.values(latestMap);
  }

  state.filteredLogs = rawLogs;
  renderLogsTable(rawLogs);
  updateFilterSummary(startDate, endDate, selectedMac, selectedStatus, rawLogs.length);
}

// Render Table
function renderLogsTable(logs) {
  tableRecordCount.textContent = `${logs.length} Records`;
  
  if (logs.length === 0) {
    logsTableBody.innerHTML = '';
    noLogsMessage.style.display = 'flex';
    return;
  }

  noLogsMessage.style.display = 'none';

  logsTableBody.innerHTML = logs.map(log => {
    const isPowerOn = log.status === 'POWER ON';
    const statusClass = isPowerOn ? 'on' : 'off';
    const statusIcon = isPowerOn ? '<i class="fa-solid fa-bolt"></i>' : '<i class="fa-solid fa-power-off"></i>';
    const voltageColor = isPowerOn ? '#10b981' : '#ef4444';

    return `
      <tr>
        <td style="white-space: nowrap;"><i class="fa-regular fa-clock" style="color:#64748b;"></i> ${log.timestamp}</td>
        <td><span class="mac-badge"><i class="fa-solid fa-barcode"></i> ${log.macAddress}</span></td>
        <td><span class="motor-badge"><i class="fa-solid fa-gears"></i> ${formatMotorId(log.motorId)}</span></td>
        <td><i class="fa-solid fa-location-dot" style="color:#06b6d4;"></i> ${log.location}</td>
        <td><span class="voltage-pill" style="color:${voltageColor};">${log.voltage.toFixed(1)} V</span></td>
        <td><span class="status-badge ${statusClass}">${statusIcon} ${log.status}</span></td>
        <td>
          <div class="action-btn-group">
            <button class="btn btn-sm btn-primary" onclick="openEditLogModal('${log.id}')" title="Edit Record">
              <i class="fa-solid fa-pen-to-square"></i> Edit
            </button>
            <button class="btn btn-sm btn-danger-sm" onclick="deleteLogRecord('${log.id}')" title="Delete Record">
              <i class="fa-solid fa-trash"></i> Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Update Filter Summary Label
function updateFilterSummary(start, end, mac, status, count) {
  let modeLabel = state.viewMode === 'latest' ? 'Live Motors (In-Place Updates)' : 'Full DB History';
  let text = `Showing ${count} motor record(s) [${modeLabel}]`;
  if (start && end) text += ` from ${start} to ${end}`;
  else if (start) text += ` from ${start} onwards`;
  else if (end) text += ` up to ${end}`;
  if (mac !== 'ALL') text += ` [MAC: ${mac}]`;
  if (status !== 'ALL') text += ` [${status}]`;
  filterSummaryText.textContent = text;
}

// Update KPIs
function updateStats() {
  kpiLogsCount.textContent = state.logs.length;
  
  const deviceStatusMap = {};
  state.logs.forEach(l => {
    const key = `${l.macAddress}_${l.motorId}`;
    if (!deviceStatusMap[key]) {
      deviceStatusMap[key] = l.status;
    }
  });

  let powerOn = 0;
  let powerOff = 0;
  Object.values(deviceStatusMap).forEach(s => {
    if (s === 'POWER ON') powerOn++;
    else powerOff++;
  });

  kpiPowerOnCount.textContent = powerOn;
  kpiPowerOffCount.textContent = powerOff;

  if (state.logs.length > 0) {
    kpiLastUpdate.textContent = `Last update: ${state.logs[0].timestamp}`;
  }
}

// Open Device Modal
function openDeviceModal() {
  modalDevice.style.display = 'flex';
  renderDevicesModalList();
}

function renderDevicesModalList() {
  if (state.devices.length === 0) {
    registeredDevicesGrid.innerHTML = '<p style="color:#94a3b8;">No registered devices yet.</p>';
    return;
  }

  registeredDevicesGrid.innerHTML = state.devices.map(d => `
    <div class="dev-item-card">
      <div class="dev-item-header">
        <span class="dev-item-title"><i class="fa-solid fa-barcode"></i> ${d.macAddress}</span>
        <span class="motor-badge">${formatMotorId(d.motorId)}</span>
      </div>
      <div style="font-size:0.8rem; color:#cbd5e1;"><i class="fa-solid fa-location-dot"></i> ${d.location}</div>
      <div style="font-size:0.75rem; color:#64748b;">${d.deviceType}</div>
      <div style="display:flex; justify-between; gap:6px; margin-top:6px;">
        <button class="btn btn-sm btn-primary" style="flex:1;" onclick="simulatePostForMac('${d.macAddress}'); modalDevice.style.display='none';">
          <i class="fa-solid fa-bolt"></i> Send POST
        </button>
        <button class="btn btn-sm btn-danger-sm" onclick="deleteDevice('${d.id}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

// Global window actions
window.openEditLogModal = function(id) {
  const log = state.logs.find(l => l.id === id);
  if (!log) return;

  document.getElementById('editLogId').value = log.id;
  document.getElementById('editMacAddress').value = log.macAddress;
  document.getElementById('editMotorId').value = log.motorId;
  document.getElementById('editLocation').value = log.location;
  document.getElementById('editVoltage').value = log.voltage;
  document.getElementById('editTimestamp').value = log.timestamp;
  document.getElementById('editStatus').value = log.status;

  const modalEditLog = document.getElementById('modalEditLog');
  if (modalEditLog) {
    modalEditLog.style.display = 'flex';
  }
};

window.simulatePostForMac = async function(mac) {
  try {
    const res = await fetch(getApiUrl('simulate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ macAddress: mac })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`⚡ POST Success for ${mac}: ${data.log.voltage}V (${data.log.status})`);
      await fetchLogs();
    }
  } catch (err) {
    showToast('Simulation failed', 'error');
  }
};

window.copyCurlForDevice = function(mac) {
  const curlUrl = window.location.href.replace(/index\.php.*/, '') + getApiUrl('voltage-logs');
  const curl = `curl -X POST "${curlUrl}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"macAddress":"${mac}", "voltage": 234.5}'`;
  copyToClipboard(curl, `cURL command for ${mac} copied!`);
};

window.deleteLogRecord = async function(id) {
  // Instant optimistic UI update
  state.logs = state.logs.filter(l => l.id !== id);
  state.filteredLogs = state.filteredLogs.filter(l => l.id !== id);
  renderLogsTable(state.filteredLogs);
  updateStats();

  try {
    const res = await fetch(getApiUrl('voltage-logs', id), { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Record deleted successfully');
    } else {
      showToast(data.error || 'Delete failed', 'error');
      await fetchLogs();
    }
  } catch (err) {
    showToast('Delete failed', 'error');
    await fetchLogs();
  }
};

window.deleteDevice = async function(id) {
  if (!confirm('Are you sure you want to delete this device registration?')) return;
  try {
    const res = await fetch(getApiUrl('devices', id), { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Device deleted');
      await fetchDevices();
      renderDevicesModalList();
    }
  } catch (err) {
    showToast('Device delete failed', 'error');
  }
};

// Chart Modal
window.openChartModal = function(mac) {
  modalChart.style.display = 'flex';
  chartModalTitle.innerHTML = `<i class="fa-solid fa-chart-line"></i> Voltage Trend Analytics for ${mac}`;
  
  const macLogs = state.logs
    .filter(l => l.macAddress === mac)
    .reverse();

  const labels = macLogs.map(l => l.timestamp);
  const dataPoints = macLogs.map(l => l.voltage);
  const statusColors = macLogs.map(l => l.status === 'POWER ON' ? '#10b981' : '#ef4444');

  const ctx = document.getElementById('voltageAnalyticsChart').getContext('2d');
  
  if (state.chartInstance) {
    state.chartInstance.destroy();
  }

  state.chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Voltage (V)',
        data: dataPoints,
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        borderWidth: 3,
        pointBackgroundColor: statusColors,
        pointRadius: 6,
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#f8fafc' } }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        },
        y: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          suggestedMin: 0,
          suggestedMax: 450
        }
      }
    }
  });
};

// Export CSV
function exportLogsCsv() {
  if (state.filteredLogs.length === 0) {
    showToast('No logs to export', 'error');
    return;
  }

  const headers = ['Timestamp', 'MAC Address', 'Motor ID', 'Location', 'Device Type', 'Voltage (V)', 'Status'];
  const csvRows = [headers.join(',')];

  state.filteredLogs.forEach(l => {
    csvRows.push([
      `"${l.timestamp}"`,
      `"${l.macAddress}"`,
      `"${l.motorId}"`,
      `"${l.location}"`,
      `"${l.deviceType}"`,
      l.voltage,
      `"${l.status}"`
    ].join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', `voltage_telemetry_report_${Date.now()}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('CSV export downloaded successfully!');
}

// Toast Helper
function showToast(msg, type = 'success') {
  toastMessage.textContent = msg;
  const icon = toast.querySelector('.toast-icon');
  if (type === 'error') {
    icon.className = 'toast-icon fa-solid fa-circle-exclamation';
    icon.style.color = '#ef4444';
    toast.style.borderColor = '#ef4444';
  } else {
    icon.className = 'toast-icon fa-solid fa-circle-check';
    icon.style.color = '#10b981';
    toast.style.borderColor = '#06b6d4';
  }
  toast.style.display = 'flex';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

// Copy Helper
function copyToClipboard(text, successMsg) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(successMsg);
  }).catch(() => {
    showToast('Failed to copy to clipboard', 'error');
  });
}
