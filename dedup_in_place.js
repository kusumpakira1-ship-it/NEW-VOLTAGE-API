const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');

const DB_CONFIG = {
  host: process.env.DB_HOST || '216.172.184.173',
  user: process.env.DB_USER || 'sunfra_farms',
  password: process.env.DB_PASSWORD || 'sunfra_farms',
  database: process.env.DB_NAME || 'sunfra_farms'
};

const DB_FILE = path.join(__dirname, 'data', 'db.json');

async function cleanAndDeduplicate() {
  console.log('🔄 Cleaning & Deduplicating logs table to 1 row per motor...');
  let pool;
  let devRows = [];
  let logRows = [];

  try {
    pool = mysql.createPool(DB_CONFIG).promise();

    // 1. Delete logs that are NOT for Motor 1..5
    await pool.query("DELETE FROM voltage_logs WHERE motorId NOT IN ('Motor 1', 'Motor 2', 'Motor 3', 'Motor 4', 'Motor 5')");

    // 2. Keep only the LATEST row per motorId in MySQL
    // Get all distinct motorIds
    const motors = ['Motor 1', 'Motor 2', 'Motor 3', 'Motor 4', 'Motor 5'];

    for (const mtr of motors) {
      // Find latest record for this motor
      const [latest] = await pool.query(
        "SELECT id FROM voltage_logs WHERE motorId = ? ORDER BY timestamp DESC, id DESC LIMIT 1",
        [mtr]
      );

      if (latest.length > 0) {
        const keepId = latest[0].id;
        // Delete older duplicate records for this motor
        await pool.query(
          "DELETE FROM voltage_logs WHERE motorId = ? AND id != ?",
          [mtr, keepId]
        );
      } else {
        // Insert a default initial record if motor doesn't have any log yet
        const newId = `LOG-500${mtr.replace('Motor ', '')}`;
        await pool.query(
          `INSERT INTO voltage_logs (id, timestamp, macAddress, motorId, location, deviceType, voltage, status)
           VALUES (?, NOW(), '9C-9C-1F-07-45-98', ?, 'Main Panel - Motor Station', 'ESP32 Voltage Sensor', 230.0, 'POWER ON')`,
          [newId, mtr]
        );
      }
    }

    const [devs] = await pool.query("SELECT * FROM devices ORDER BY id ASC");
    const [logs] = await pool.query("SELECT * FROM voltage_logs ORDER BY motorId ASC");
    devRows = devs;
    logRows = logs;

    console.log(`✅ MySQL Cleaned! Devices count: ${devRows.length}, Logs count: ${logRows.length}`);
    await pool.end();
  } catch (err) {
    console.error('⚠️ MySQL error during cleanup (falling back to local JSON):', err.message);
  }

  // Also clean local db.json
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data && data.voltageLogs) {
        const motorMap = {};
        data.voltageLogs.forEach(log => {
          const m = log.motorId || 'Motor 1';
          if (!motorMap[m] || new Date(log.timestamp) > new Date(motorMap[m].timestamp)) {
            motorMap[m] = log;
          }
        });
        data.voltageLogs = Object.values(motorMap);
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
        console.log(`✅ Local db.json cleaned & deduplicated! Logs count: ${data.voltageLogs.length}`);
      }
    } catch (e) {
      console.error('Local JSON cleanup error:', e.message);
    }
  }
}

cleanAndDeduplicate();
