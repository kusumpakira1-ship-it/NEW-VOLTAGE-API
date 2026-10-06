const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const mysqlDb = require('./mysql-db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database File Path
const DB_FILE = path.join(__dirname, 'data', 'db.json');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DB_FILE))) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
}

// Format MAC Address to use hyphens '-' (e.g., 00-1B-44-11-3A-B7)
function formatMacAddress(mac) {
  return mysqlDb.formatMacAddress(mac);
}

// Format Timestamp YYYY-MM-DD HH:mm:ss
function formatTimestamp(d = new Date()) {
  return mysqlDb.formatTimestamp(d);
}

// Synchronous loadDb (reads local json cache)
function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {}
  }
  return { devices: [], voltageLogs: [] };
}

// Async loadDb (reads directly from MySQL database 145.223.17.70)
async function loadDbAsync() {
  return await mysqlDb.loadDb();
}

// Save DB helper
function saveDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

// Initial Database Seed Data (Clean 5 Real ESP32 Motors)
const initialData = {
  devices: [
    {
      id: "DEV-5001",
      macAddress: "9C-9C-1F-07-45-98",
      location: "Main Panel - Motor Station",
      deviceType: "ESP32 Voltage Sensor",
      motorId: "Motor 1",
      voltageThreshold: 180,
      createdAt: "2026-09-28T08:00:00.000Z"
    },
    {
      id: "DEV-5002",
      macAddress: "9C-9C-1F-07-45-98",
      location: "Main Panel - Motor Station",
      deviceType: "ESP32 Voltage Sensor",
      motorId: "Motor 2",
      voltageThreshold: 180,
      createdAt: "2026-09-28T08:00:00.000Z"
    },
    {
      id: "DEV-5003",
      macAddress: "9C-9C-1F-07-45-98",
      location: "Main Panel - Motor Station",
      deviceType: "ESP32 Voltage Sensor",
      motorId: "Motor 3",
      voltageThreshold: 180,
      createdAt: "2026-09-28T08:00:00.000Z"
    },
    {
      id: "DEV-5004",
      macAddress: "9C-9C-1F-07-45-98",
      location: "Main Panel - Motor Station",
      deviceType: "ESP32 Voltage Sensor",
      motorId: "Motor 4",
      voltageThreshold: 180,
      createdAt: "2026-09-28T08:00:00.000Z"
    },
    {
      id: "DEV-5005",
      macAddress: "9C-9C-1F-07-45-98",
      location: "Main Panel - Motor Station",
      deviceType: "ESP32 Voltage Sensor",
      motorId: "Motor 5",
      voltageThreshold: 180,
      createdAt: "2026-09-28T08:00:00.000Z"
    }
  ],
  voltageLogs: [
    {
      id: "LOG-5001",
      timestamp: "2026-09-28 17:25:00",
      macAddress: "9C-9C-1F-07-45-98",
      motorId: "Motor 1",
      location: "Main Panel - Motor Station",
      deviceType: "ESP32 Voltage Sensor",
      voltage: 230.5,
      status: "POWER ON"
    },
    {
      id: "LOG-5002",
      timestamp: "2026-09-28 17:25:00",
      macAddress: "9C-9C-1F-07-45-98",
      motorId: "Motor 2",
      location: "Main Panel - Motor Station",
      deviceType: "ESP32 Voltage Sensor",
      voltage: 228.0,
      status: "POWER ON"
    },
    {
      id: "LOG-5003",
      timestamp: "2026-09-28 17:25:00",
      macAddress: "9C-9C-1F-07-45-98",
      motorId: "Motor 3",
      location: "Main Panel - Motor Station",
      deviceType: "ESP32 Voltage Sensor",
      voltage: 232.1,
      status: "POWER ON"
    },
    {
      id: "LOG-5004",
      timestamp: "2026-09-28 17:25:00",
      macAddress: "9C-9C-1F-07-45-98",
      motorId: "Motor 4",
      location: "Main Panel - Motor Station",
      deviceType: "ESP32 Voltage Sensor",
      voltage: 229.4,
      status: "POWER ON"
    },
    {
      id: "LOG-5005",
      timestamp: "2026-09-28 17:25:00",
      macAddress: "9C-9C-1F-07-45-98",
      motorId: "Motor 5",
      location: "Main Panel - Motor Station",
      deviceType: "ESP32 Voltage Sensor",
      voltage: 231.0,
      status: "POWER ON"
    }
  ]
};

// Helper: Read DB
function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    saveDb(initialData);
    return initialData;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    saveDb(initialData);
    return initialData;
  }
}

// Helper: Save DB
function saveDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Helper function to handle sensor reading creation from POST body or GET query params
async function createVoltageReading(rawMac, voltageVal, statusVal, motorIdVal, locationVal, deviceTypeVal) {
  // Default MAC to ESP32 MAC 9C-9C-1F-07-45-98 if omitted or empty/dummy
  const effectiveMac = (!rawMac || rawMac === '00-00-00-00-00-00' || rawMac === '00:00:00:00:00:00') 
    ? '9C-9C-1F-07-45-98' 
    : rawMac;

  const formattedMac = formatMacAddress(effectiveMac);
  const numericVoltage = parseFloat(Number(voltageVal !== undefined && voltageVal !== null ? voltageVal : 0.0).toFixed(2));
  const db = await loadDbAsync();

  // Format Motor ID strictly as Motor 1, Motor 2, Motor 3, Motor 4, Motor 5
  let rawMotorStr = motorIdVal ? String(motorIdVal).trim() : '';
  let parsedMotorId = '';
  if (rawMotorStr) {
    const numMatch = rawMotorStr.match(/\d+/);
    if (numMatch && parseInt(numMatch[0]) >= 1 && parseInt(numMatch[0]) <= 5) {
      parsedMotorId = `Motor ${numMatch[0]}`;
    } else {
      parsedMotorId = rawMotorStr;
    }
  }

  // Look up matching registered device (restricted to the 5 real motors)
  let matchedDeviceIndex = db.devices.findIndex(d => 
    (d.macAddress === formattedMac || d.macAddress === '9C-9C-1F-07-45-98') && 
    (parsedMotorId ? d.motorId.toLowerCase() === parsedMotorId.toLowerCase() : true)
  );

  if (matchedDeviceIndex === -1 && parsedMotorId) {
    matchedDeviceIndex = db.devices.findIndex(d => d.motorId.toLowerCase() === parsedMotorId.toLowerCase());
  }

  let matchedDevice = matchedDeviceIndex >= 0 ? db.devices[matchedDeviceIndex] : null;

  let finalMotorId = parsedMotorId || (matchedDevice ? matchedDevice.motorId : 'Motor 1');
  let finalLocation = (locationVal && String(locationVal).trim()) ? String(locationVal).trim() : (matchedDevice ? matchedDevice.location : 'Main Panel - Motor Station');
  let finalDeviceType = (deviceTypeVal && String(deviceTypeVal).trim()) ? String(deviceTypeVal).trim() : (matchedDevice ? matchedDevice.deviceType : 'ESP32 Voltage Sensor');

  if (matchedDeviceIndex >= 0) {
    db.devices[matchedDeviceIndex].macAddress = formattedMac;
    if (parsedMotorId) db.devices[matchedDeviceIndex].motorId = finalMotorId;
    if (locationVal && String(locationVal).trim()) db.devices[matchedDeviceIndex].location = finalLocation;
    matchedDevice = db.devices[matchedDeviceIndex];
    await mysqlDb.saveDeviceToMySql(matchedDevice);
  }

  // Determine POWER STATUS: POWER ON (>= 180V) vs POWER OFF (< 80V) or use statusVal if passed
  let calculatedStatus = numericVoltage >= 180 ? 'POWER ON' : 'POWER OFF';
  if (statusVal) {
    const cleanStatus = String(statusVal).trim().toUpperCase().replace(/_/g, ' ');
    if (cleanStatus === 'ON' || cleanStatus === 'POWER ON') {
      calculatedStatus = 'POWER ON';
    } else if (cleanStatus === 'OFF' || cleanStatus === 'POWER OFF') {
      calculatedStatus = 'POWER OFF';
    } else {
      calculatedStatus = cleanStatus;
    }
  }

  // Current server timestamp
  const timestampStr = formatTimestamp(new Date());

  const newLog = {
    id: `LOG-${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 90)}`,
    timestamp: timestampStr,
    macAddress: formattedMac,
    motorId: finalMotorId,
    location: finalLocation,
    deviceType: finalDeviceType,
    voltage: numericVoltage,
    status: calculatedStatus
  };

  db.voltageLogs.unshift(newLog);
  saveDb(db);

  // Save log to MySQL
  await mysqlDb.saveLogToMySql(newLog);

  return {
    success: true,
    message: 'Voltage sensor reading recorded successfully in database',
    log: newLog
  };
}

// -------------------------------------------------------------
// REST API ENDPOINTS
// -------------------------------------------------------------

// 1. GET ALL DEVICES
app.get('/api/devices', async (req, res) => {
  const db = await loadDbAsync();
  res.json({ success: true, count: db.devices.length, devices: db.devices });
});

// 2. CREATE / REGISTER DEVICE (POST /api/devices)
app.post('/api/devices', async (req, res) => {
  let { macAddress, location, deviceType, motorId, voltageThreshold } = req.body;
  
  if (!macAddress) {
    return res.status(400).json({ success: false, error: 'MAC Address is required' });
  }

  const formattedMac = formatMacAddress(macAddress);
  const db = await loadDbAsync();

  // Generate Motor ID if not provided
  if (!motorId || !motorId.trim()) {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    motorId = `MTR-${randomNum}`;
  }

  // Check if device already exists
  let existingIndex = db.devices.findIndex(d => d.macAddress === formattedMac && d.motorId === motorId);
  let deviceRecord;

  if (existingIndex >= 0) {
    // Update existing device
    db.devices[existingIndex] = {
      ...db.devices[existingIndex],
      location: location || db.devices[existingIndex].location,
      deviceType: deviceType || db.devices[existingIndex].deviceType,
      motorId: motorId || db.devices[existingIndex].motorId,
      voltageThreshold: Number(voltageThreshold) || db.devices[existingIndex].voltageThreshold || 180,
      updatedAt: new Date().toISOString()
    };
    deviceRecord = db.devices[existingIndex];
  } else {
    // Create new device
    deviceRecord = {
      id: `DEV-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`,
      macAddress: formattedMac,
      location: location || 'Main Panel - Motor Station',
      deviceType: deviceType || 'ESP32 Voltage Sensor',
      motorId: motorId,
      voltageThreshold: Number(voltageThreshold) || 180,
      createdAt: new Date().toISOString()
    };
    db.devices.push(deviceRecord);
  }

  saveDb(db);
  await mysqlDb.saveDeviceToMySql(deviceRecord);

  res.status(201).json({
    success: true,
    message: existingIndex >= 0 ? 'Device updated successfully' : 'Device created successfully',
    device: deviceRecord
  });
});

// 3. DELETE DEVICE (DELETE /api/devices/:id)
app.delete('/api/devices/:id', async (req, res) => {
  const db = await loadDbAsync();
  const initialLength = db.devices.length;
  db.devices = db.devices.filter(d => d.id !== req.params.id && d.macAddress !== req.params.id);
  
  saveDb(db);
  await mysqlDb.deleteDeviceFromMySql(req.params.id);

  res.json({ success: true, message: 'Device deleted successfully' });
});

// 4. MAIN VOLTAGE SENSOR CREATE API ENDPOINT (POST /api/voltage-logs)
app.post('/api/voltage-logs', async (req, res) => {
  const reqBody = req.body || {};
  const reqQuery = req.query || {};
  const rawMac = reqBody.macAddress || reqBody.mac || reqBody.mac_address || reqQuery.mac_address || reqQuery.macAddress || reqQuery.mac;
  const voltage = reqBody.voltage !== undefined ? reqBody.voltage : (reqBody.voltage_value !== undefined ? reqBody.voltage_value : (reqQuery.voltage_value !== undefined ? reqQuery.voltage_value : reqQuery.voltage));
  const status = reqBody.status || reqQuery.status || reqQuery.status_value;
  const motorId = reqBody.motor_id || reqBody.motorId || reqQuery.motor_id || reqQuery.motorId || reqQuery.motor;
  const location = reqBody.location || reqQuery.location || reqQuery.loc;
  const deviceType = reqBody.device_type || reqBody.deviceType || reqQuery.device_type || reqQuery.deviceType;

  const result = await createVoltageReading(rawMac, voltage, status, motorId, location, deviceType);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.status(201).json(result);
});

// Endpoint matching user URL pattern: /api/voltage_for_interns.php or /voltage_for_interns.php
app.all(['/api/voltage_for_interns.php', '/voltage_for_interns.php'], async (req, res) => {
  const reqBody = req.body || {};
  const reqQuery = req.query || {};
  const rawMac = reqQuery.mac_address || reqQuery.macAddress || reqQuery.mac || reqBody.mac_address || reqBody.macAddress || reqBody.mac;
  const voltage = reqQuery.voltage_value !== undefined ? reqQuery.voltage_value : (reqQuery.voltage !== undefined ? reqQuery.voltage : (reqBody.voltage_value !== undefined ? reqBody.voltage_value : reqBody.voltage));
  const status = reqQuery.status || reqQuery.status_value || reqBody.status || reqBody.status_value;
  const motorId = reqQuery.motor_id || reqQuery.motorId || reqQuery.motor || reqBody.motor_id || reqBody.motorId || reqBody.motor;
  const location = reqQuery.location || reqQuery.loc || reqBody.location;
  const deviceType = reqQuery.device_type || reqQuery.deviceType || reqBody.device_type || reqBody.deviceType;

  const result = await createVoltageReading(rawMac, voltage, status, motorId, location, deviceType);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.status(201).json(result);
});

// 5. GET VOLTAGE LOGS WITH SELECTION OF DATES & FILTERS (GET /api/voltage-logs)
app.get('/api/voltage-logs', async (req, res) => {
  // If GET request contains voltage_value & mac_address, record reading!
  if ((req.query.mac_address || req.query.macAddress || req.query.mac) && (req.query.voltage_value !== undefined || req.query.voltage !== undefined)) {
    const rawMac = req.query.mac_address || req.query.macAddress || req.query.mac;
    const voltage = req.query.voltage_value !== undefined ? req.query.voltage_value : req.query.voltage;
    const status = req.query.status || req.query.status_value;
    const motorId = req.query.motor_id || req.query.motorId || req.query.motor;
    const location = req.query.location || req.query.loc;
    const deviceType = req.query.device_type || req.query.deviceType;

    const result = await createVoltageReading(rawMac, voltage, status, motorId, location, deviceType);
    return res.status(result.success ? 201 : 400).json(result);
  }

  const db = await loadDbAsync();
  let logs = [...db.voltageLogs];

  const { startDate, endDate, macAddress, motorId, status, search } = req.query;

  // Filter by Start Date
  if (startDate) {
    const startObj = new Date(startDate);
    if (!isNaN(startObj.getTime())) {
      const startMs = startObj.setHours(0, 0, 0, 0);
      logs = logs.filter(log => {
        const logDate = new Date(log.timestamp);
        return !isNaN(logDate.getTime()) && logDate.getTime() >= startMs;
      });
    }
  }

  // Filter by End Date
  if (endDate) {
    const endObj = new Date(endDate);
    if (!isNaN(endObj.getTime())) {
      const endMs = endObj.setHours(23, 59, 59, 999);
      logs = logs.filter(log => {
        const logDate = new Date(log.timestamp);
        return !isNaN(logDate.getTime()) && logDate.getTime() <= endMs;
      });
    }
  }

  // Filter by MAC Address
  if (macAddress && macAddress !== 'ALL') {
    const formattedFilterMac = formatMacAddress(macAddress);
    logs = logs.filter(log => log.macAddress === formattedFilterMac);
  }

  // Filter by Motor ID
  if (motorId && motorId !== 'ALL') {
    logs = logs.filter(log => log.motorId.toLowerCase().includes(motorId.toLowerCase()));
  }

  // Filter by Status (POWER ON / POWER OFF)
  if (status && status !== 'ALL') {
    logs = logs.filter(log => log.status.toUpperCase() === status.toUpperCase());
  }

  // General Search term
  if (search) {
    const q = search.toLowerCase();
    logs = logs.filter(log => 
      log.macAddress.toLowerCase().includes(q) ||
      log.motorId.toLowerCase().includes(q) ||
      log.location.toLowerCase().includes(q) ||
      log.deviceType.toLowerCase().includes(q) ||
      String(log.voltage).includes(q) ||
      log.status.toLowerCase().includes(q) ||
      log.timestamp.includes(q)
    );
  }

  res.json({
    success: true,
    totalRecords: logs.length,
    filtersApplied: { startDate, endDate, macAddress, motorId, status, search },
    logs: logs
  });
});

// UPDATE VOLTAGE LOG (PUT /api/voltage-logs/:id)
app.put('/api/voltage-logs/:id', async (req, res) => {
  const db = await loadDbAsync();
  const logIndex = db.voltageLogs.findIndex(l => l.id === req.params.id);

  if (logIndex === -1) {
    return res.status(404).json({ success: false, error: 'Voltage log record not found' });
  }

  const existing = db.voltageLogs[logIndex];
  const { macAddress, motorId, location, voltage, timestamp, status } = req.body;

  const newVoltage = voltage !== undefined ? parseFloat(Number(voltage).toFixed(2)) : existing.voltage;
  const newMac = macAddress ? formatMacAddress(macAddress) : existing.macAddress;
  const newStatus = status ? status : (newVoltage >= 180 ? 'POWER ON' : 'POWER OFF');

  db.voltageLogs[logIndex] = {
    ...existing,
    macAddress: newMac,
    motorId: motorId || existing.motorId,
    location: location || existing.location,
    voltage: newVoltage,
    status: newStatus,
    timestamp: timestamp || existing.timestamp
  };

  saveDb(db);
  await mysqlDb.saveLogToMySql(db.voltageLogs[logIndex]);

  res.json({
    success: true,
    message: 'Voltage record updated successfully',
    log: db.voltageLogs[logIndex]
  });
});

// 6. DELETE VOLTAGE LOG (DELETE /api/voltage-logs/:id)
app.delete('/api/voltage-logs/:id', async (req, res) => {
  const db = await loadDbAsync();
  db.voltageLogs = db.voltageLogs.filter(l => l.id !== req.params.id);
  saveDb(db);
  await mysqlDb.deleteLogFromMySql(req.params.id);

  res.json({ success: true, message: 'Voltage record deleted successfully' });
});

// 7. SIMULATE QUICK POST SENSOR READINGS (POST /api/voltage-logs/simulate)
app.post('/api/voltage-logs/simulate', async (req, res) => {
  const db = await loadDbAsync();
  if (!db.devices || db.devices.length === 0) {
    return res.status(400).json({ success: false, error: 'No devices registered. Create a device first!' });
  }

  const reqBody = req.body || {};
  const targetMac = reqBody.macAddress ? formatMacAddress(reqBody.macAddress) : null;
  let device = targetMac ? db.devices.find(d => d.macAddress === targetMac) : null;
  
  if (!device) {
    device = db.devices[Math.floor(Math.random() * db.devices.length)];
  }

  let voltageVal;
  if (reqBody.forcePowerOn) {
    voltageVal = (185 + Math.random() * 60).toFixed(1);
  } else if (reqBody.forcePowerOff) {
    voltageVal = (Math.random() * 75).toFixed(1);
  } else {
    voltageVal = Math.random() > 0.3 ? (185 + Math.random() * 60).toFixed(1) : (Math.random() * 75).toFixed(1);
  }

  const numericVoltage = parseFloat(voltageVal);
  const status = numericVoltage >= 180 ? 'POWER ON' : 'POWER OFF';

  const newLog = {
    id: `LOG-${Date.now().toString().slice(-6)}`,
    timestamp: formatTimestamp(new Date()),
    macAddress: device.macAddress,
    motorId: device.motorId,
    location: device.location,
    deviceType: device.deviceType,
    voltage: numericVoltage,
    status: status
  };

  db.voltageLogs.unshift(newLog);
  saveDb(db);
  await mysqlDb.saveLogToMySql(newLog);

  res.status(201).json({
    success: true,
    message: `Simulated POST request successfully executed for device ${device.macAddress}`,
    log: newLog
  });
});

// 8. GET SYSTEM SUMMARY STATS (GET /api/stats)
app.get('/api/stats', async (req, res) => {
  const db = await loadDbAsync();
  
  // Calculate latest status per unique motor (macAddress + motorId)
  const latestDeviceMap = {};
  db.voltageLogs.forEach(log => {
    const key = `${log.macAddress}_${log.motorId}`;
    if (!latestDeviceMap[key]) {
      latestDeviceMap[key] = log;
    }
  });

  let powerOnCount = 0;
  let powerOffCount = 0;

  Object.values(latestDeviceMap).forEach(log => {
    if (log.status === 'POWER ON') powerOnCount++;
    else powerOffCount++;
  });

  res.json({
    success: true,
    totalDevices: db.devices.length,
    totalLogs: db.voltageLogs.length,
    activePowerOn: powerOnCount,
    activePowerOff: powerOffCount,
    lastUpdate: db.voltageLogs.length > 0 ? db.voltageLogs[0].timestamp : 'No logs yet'
  });
});

// RESET SEED API
app.post('/api/reset-db', (req, res) => {
  saveDb(initialData);
  res.json({ success: true, message: 'Database reset to default seed data' });
});

// Start Server on 0.0.0.0 (All network interfaces for local network ESP32 boards)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`⚡ VOLTAGE SENSOR MONITORING API SERVER RUNNING AT:`);
  console.log(`👉 Localhost: http://localhost:${PORT}`);
  console.log(`👉 Network:   http://192.168.4.113:${PORT}`);
  console.log(`👉 ESP32 API: http://192.168.4.113:${PORT}/voltage_for_interns.php`);
  console.log(`=======================================================`);
});

module.exports = { createVoltageReading };
