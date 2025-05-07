const express = require('express');
const cors = require('cors');
const app = express();
const path = require('path');
require('dotenv').config({ path: './main/.env' }); // At the very top


// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

// Serve signin.html when the user accesses /signin
app.get('/signin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signin.html'));
});

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');  // Add this line
app.use('/api', authRoutes);
app.use('/api/admin', adminRoutes);  // Add this line for admin routes

// Test route
app.get('/', (req, res) => {
  res.send('Backend is running');
});



// Start server
const port = 5000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
