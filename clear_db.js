const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');

async function clearDatabase() {
  console.log('🔄 Connecting to MySQL Database: 216.172.184.173...');
  
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '216.172.184.173',
    user: process.env.DB_USER || 'sunfra_farms',
    password: process.env.DB_PASSWORD || 'sunfra_farms',
    database: process.env.DB_NAME || 'sunfra_farms',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  }).promise();

  console.log('🧹 Clearing devices and voltage_logs tables in MySQL...');
  await pool.query('DELETE FROM devices;');
  await pool.query('DELETE FROM voltage_logs;');

  console.log('✅ Tables devices and voltage_logs cleared!');

  const jsonDbPath = path.join(__dirname, 'data', 'db.json');
  const emptyData = { devices: [], voltageLogs: [] };
  
  try {
    fs.writeFileSync(jsonDbPath, JSON.stringify(emptyData, null, 2), 'utf8');
    console.log('✅ Local db.json cleared!');
  } catch(e) {
    console.error('Error clearing local db.json:', e.message);
  }

  await pool.end();
  console.log('🎉 Database wipe complete!');
}

clearDatabase().catch(err => {
  console.error('❌ Failed to clear database:', err);
});
