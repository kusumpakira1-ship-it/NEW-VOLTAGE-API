// mysql-db.js - MySQL Database Connection & Persistence Helper
const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');

const DB_CONFIG = {
  host: process.env.DB_HOST || '216.172.184.173',
  user: process.env.DB_USER || 'sunfra_farms',
  password: process.env.DB_PASSWORD || 'sunfra_farms',
  database: process.env.DB_NAME || 'sunfra_farms',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const DB_FILE = path.join(__dirname, 'data', 'db.json');
let pool;

try {
  pool = mysql.createPool(DB_CONFIG).promise();
  console.log('✅ Connected to MySQL Database Server (216.172.184.173)');
} catch (e) {
  console.error('⚠️ Could not create MySQL pool, falling back to local JSON db:', e.message);
}

// Helper: Format MAC Address with hyphens
function formatMacAddress(mac) {
  if (!mac) return '00-00-00-00-00-00';
  const clean = mac.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (clean.length === 12) {
    return clean.match(/.{1,2}/g).join('-');
  }
  return mac.trim().replace(/:/g, '-').toUpperCase();
}

// Helper: Format Timestamp in Indian Standard Time (IST, Asia/Kolkata, UTC + 5:30)
function formatTimestamp(d = new Date()) {
  const targetDate = typeof d === 'string' || typeof d === 'number' ? new Date(d) : (d || new Date());
  const istDateStr = targetDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const istDate = new Date(istDateStr);
  const pad = (n) => String(n).padStart(2, '0');
  const year = istDate.getFullYear();
  const month = pad(istDate.getMonth() + 1);
  const day = pad(istDate.getDate());
  const hours = pad(istDate.getHours());
  const mins = pad(istDate.getMinutes());
  const secs = pad(istDate.getSeconds());
  return `${year}-${month}-${day} ${hours}:${mins}:${secs}`;
}

// Local JSON File Sync Helper
function saveJsonDb(data) {
  try {
    if (!fs.existsSync(path.dirname(DB_FILE))) {
      fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving local JSON db file:', err.message);
  }
}

// Load DB from MySQL with JSON fallback
async function loadDb() {
  if (pool) {
    try {
      const [devRows] = await pool.query('SELECT * FROM devices ORDER BY createdAt DESC');
      const [logRows] = await pool.query('SELECT * FROM voltage_logs ORDER BY timestamp DESC');
      
      const devices = devRows.map(d => ({
        id: d.id,
        macAddress: formatMacAddress(d.macAddress),
        motorId: d.motorId,
        location: d.location || 'Main Panel - Motor Station',
        deviceType: d.deviceType || 'ESP32 Voltage Sensor',
        voltageThreshold: Number(d.voltageThreshold) || 180,
        createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString()
      }));

      const voltageLogs = logRows.map(l => ({
        id: l.id,
        timestamp: l.timestamp ? formatTimestamp(new Date(l.timestamp)) : formatTimestamp(new Date()),
        macAddress: formatMacAddress(l.macAddress),
        motorId: l.motorId,
        location: l.location || 'Main Panel - Motor Station',
        deviceType: l.deviceType || 'ESP32 Voltage Sensor',
        voltage: parseFloat(Number(l.voltage).toFixed(2)),
        status: l.status
      }));

      const dbData = { devices, voltageLogs };
      saveJsonDb(dbData); // Keep local JSON synced
      return dbData;
    } catch (e) {
      console.error('MySQL load error, reading local JSON:', e.message);
    }
  }

  // Fallback to local db.json
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {}
  }
  return { devices: [], voltageLogs: [] };
}

// Insert / Update Device in MySQL
async function saveDeviceToMySql(dev) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO devices (id, macAddress, motorId, location, deviceType, voltageThreshold, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
       location = VALUES(location),
       deviceType = VALUES(deviceType),
       motorId = VALUES(motorId),
       voltageThreshold = VALUES(voltageThreshold)`,
      [dev.id, dev.macAddress, dev.motorId, dev.location, dev.deviceType, dev.voltageThreshold]
    );
  } catch (err) {
    console.error('Error saving device to MySQL:', err.message);
  }
}

// Insert Voltage Log to MySQL
async function saveLogToMySql(log) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO voltage_logs (id, timestamp, macAddress, motorId, location, deviceType, voltage, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [log.id, log.timestamp, log.macAddress, log.motorId, log.location, log.deviceType, log.voltage, log.status]
    );
  } catch (err) {
    console.error('Error saving log to MySQL:', err.message);
  }
}

// Delete Log from MySQL
async function deleteLogFromMySql(id) {
  if (!pool) return;
  try {
    await pool.query('DELETE FROM voltage_logs WHERE id = ?', [id]);
  } catch (err) {
    console.error('Error deleting log from MySQL:', err.message);
  }
}

// Delete Device from MySQL
async function deleteDeviceFromMySql(id) {
  if (!pool) return;
  try {
    await pool.query('DELETE FROM devices WHERE id = ? OR macAddress = ?', [id, id]);
  } catch (err) {
    console.error('Error deleting device from MySQL:', err.message);
  }
}

module.exports = {
  loadDb,
  saveDeviceToMySql,
  saveLogToMySql,
  deleteLogFromMySql,
  deleteDeviceFromMySql,
  formatMacAddress,
  formatTimestamp
};
