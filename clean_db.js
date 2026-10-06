const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');

const DB_CONFIG = {
  host: process.env.DB_HOST || '145.223.17.70',
  user: process.env.DB_USER || 'u632391467_kusumpakira',
  password: process.env.DB_PASSWORD || 'Kusum@2026Bb!',
  database: process.env.DB_NAME || 'u632391467_kusumpakira',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const DB_FILE = path.join(__dirname, 'data', 'db.json');

async function cleanDatabase() {
  console.log('🔄 Connecting to MySQL Database...');
  const pool = mysql.createPool(DB_CONFIG).promise();

  // 1. Delete devices that are not Motor 1 to Motor 5
  await pool.query("DELETE FROM devices WHERE motorId NOT IN ('Motor 1', 'Motor 2', 'Motor 3', 'Motor 4', 'Motor 5')");
  
  // 2. Update MAC address for all remaining devices to 9C-9C-1F-07-45-98
  await pool.query("UPDATE devices SET macAddress = '9C-9C-1F-07-45-98' WHERE motorId IN ('Motor 1', 'Motor 2', 'Motor 3', 'Motor 4', 'Motor 5')");

  // 3. Ensure all 5 devices exist cleanly
  const seedDevs = [
    ['DEV-5001', '9C-9C-1F-07-45-98', 'Motor 1', 'Main Panel - Motor Station', 'ESP32 Voltage Sensor', 180],
    ['DEV-5002', '9C-9C-1F-07-45-98', 'Motor 2', 'Main Panel - Motor Station', 'ESP32 Voltage Sensor', 180],
    ['DEV-5003', '9C-9C-1F-07-45-98', 'Motor 3', 'Main Panel - Motor Station', 'ESP32 Voltage Sensor', 180],
    ['DEV-5004', '9C-9C-1F-07-45-98', 'Motor 4', 'Main Panel - Motor Station', 'ESP32 Voltage Sensor', 180],
    ['DEV-5005', '9C-9C-1F-07-45-98', 'Motor 5', 'Main Panel - Motor Station', 'ESP32 Voltage Sensor', 180]
  ];

  for (const d of seedDevs) {
    await pool.query(
      `INSERT INTO devices (id, macAddress, motorId, location, deviceType, voltageThreshold, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE macAddress=VALUES(macAddress), location=VALUES(location)`,
      d
    );
  }

  // 4. Update voltage_logs MAC address from 00-00-00-00-00-00 or AA-BB-CC-DD-EE-FF to 9C-9C-1F-07-45-98 for Motor 1 to Motor 5
  await pool.query("UPDATE voltage_logs SET macAddress = '9C-9C-1F-07-45-98' WHERE motorId IN ('Motor 1', 'Motor 2', 'Motor 3', 'Motor 4', 'Motor 5')");

  // 5. Delete logs that belong to non-existent dummy motors (e.g. Motor 6, MTR-xxxx, etc.)
  await pool.query("DELETE FROM voltage_logs WHERE motorId NOT IN ('Motor 1', 'Motor 2', 'Motor 3', 'Motor 4', 'Motor 5')");

  console.log('✅ MySQL Cleanup Complete!');

  // Sync to local db.json
  const [devRows] = await pool.query('SELECT * FROM devices ORDER BY createdAt ASC');
  const [logRows] = await pool.query('SELECT * FROM voltage_logs ORDER BY timestamp DESC');
  
  const devices = devRows.map(d => ({
    id: d.id,
    macAddress: d.macAddress,
    motorId: d.motorId,
    location: d.location || 'Main Panel - Motor Station',
    deviceType: d.deviceType || 'ESP32 Voltage Sensor',
    voltageThreshold: Number(d.voltageThreshold) || 180,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString()
  }));

  const voltageLogs = logRows.map(l => ({
    id: l.id,
    timestamp: l.timestamp ? new Date(l.timestamp).toISOString().replace('T', ' ').substring(0, 19) : new Date().toISOString().replace('T', ' ').substring(0, 19),
    macAddress: l.macAddress,
    motorId: l.motorId,
    location: l.location || 'Main Panel - Motor Station',
    deviceType: l.deviceType || 'ESP32 Voltage Sensor',
    voltage: parseFloat(Number(l.voltage).toFixed(2)),
    status: l.status
  }));

  fs.writeFileSync(DB_FILE, JSON.stringify({ devices, voltageLogs }, null, 2), 'utf8');
  console.log('✅ Local db.json synced with clean 5 motors and MAC 9C-9C-1F-07-45-98!');

  await pool.end();
}

cleanDatabase().catch(err => {
  console.error('❌ Clean DB error:', err);
});
