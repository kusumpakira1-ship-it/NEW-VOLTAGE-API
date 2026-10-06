const mysql = require('mysql2');

async function setupDatabase() {
  console.log('🔄 Connecting to MySQL Database: 216.172.184.173 (sunfra_farms)...');
  
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '216.172.184.173',
    user: process.env.DB_USER || 'sunfra_farms',
    password: process.env.DB_PASSWORD || 'sunfra_farms',
    database: process.env.DB_NAME || 'sunfra_farms',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  }).promise();

  console.log('✅ Connected! Creating MySQL tables...');

  // 1. Devices table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS devices (
      id VARCHAR(50) PRIMARY KEY,
      macAddress VARCHAR(50) NOT NULL,
      motorId VARCHAR(50) NOT NULL,
      location VARCHAR(255),
      deviceType VARCHAR(255),
      voltageThreshold FLOAT DEFAULT 180,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 2. Voltage Logs table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS voltage_logs (
      id VARCHAR(50) PRIMARY KEY,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      macAddress VARCHAR(50) NOT NULL,
      motorId VARCHAR(50) NOT NULL,
      location VARCHAR(255),
      deviceType VARCHAR(255),
      voltage FLOAT NOT NULL,
      status VARCHAR(50) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  console.log('✅ Tables "devices" and "voltage_logs" created successfully!');

  await pool.end();
  console.log('🎉 Database initialization complete!');
  console.log('🎉 Database initialization complete!');
}

setupDatabase().catch(err => {
  console.error('❌ Setup failed:', err);
});
