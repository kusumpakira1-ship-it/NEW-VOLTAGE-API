const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');

const DB_CONFIG = {
  host: process.env.DB_HOST || '145.223.17.70',
  user: process.env.DB_USER || 'u632391467_kusumpakira',
  password: process.env.DB_PASSWORD || 'Kusum@2026Bb!',
  database: process.env.DB_NAME || 'u632391467_kusumpakira'
};

const DB_FILE = path.join(__dirname, 'data', 'db.json');

async function run() {
  const pool = mysql.createPool(DB_CONFIG).promise();
  await pool.query("DELETE FROM devices WHERE id NOT IN ('DEV-5001', 'DEV-5002', 'DEV-5003', 'DEV-5004', 'DEV-5005')");
  await pool.query("UPDATE devices SET macAddress = '9C-9C-1F-07-45-98'");
  const [devs] = await pool.query('SELECT * FROM devices ORDER BY id ASC');
  console.log('CLEANED DEVICES (Count ' + devs.length + '):');
  devs.forEach(d => console.log(`ID: ${d.id} | MAC: ${d.macAddress} | Motor: ${d.motorId} | Location: ${d.location}`));
  
  // Sync to db.json
  const [logRows] = await pool.query('SELECT * FROM voltage_logs ORDER BY timestamp DESC');
  fs.writeFileSync(DB_FILE, JSON.stringify({ devices: devs, voltageLogs: logRows }, null, 2), 'utf8');

  await pool.end();
}

run().catch(console.error);
