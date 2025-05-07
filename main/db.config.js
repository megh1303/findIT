require('dotenv').config();
const mysql = require('mysql2/promise');

async function connectToDatabase() {
  try {
    const db = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      ssl: {
        rejectUnauthorized: true,
      },
    });

    console.log('Connected to database with SSL');
    return db;
  } catch (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = connectToDatabase;
