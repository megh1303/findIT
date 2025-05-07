const mysql = require('mysql');

// Setup MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root', // your MySQL username
  password: 'Anjali@21', // your MySQL password
  database: 'findit_db' // your database name
});

db.connect(err => {
  if (err) {
    console.error('Database connection failed:', err.stack);
    return;
  }
  console.log('Connected to database');
});

module.exports = db;