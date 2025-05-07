// Debug log to indicate the route file is loaded
console.log("authRoutes.js loaded");

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db.config'); // MySQL DB config
const multer = require('multer'); // For handling file uploads
const path = require('path');
const fs = require('fs');
const crypto = require('crypto'); // Correctly import the crypto module

const router = express.Router();

// Ensure 'uploads' directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer configuration to handle file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // Store files in /uploads
  },
  filename: (req, file, cb) => {
    // Generate a unique filename
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// ===================== User Signup =====================
router.post('/signup', async (req, res) => {
  const { full_name, email, password } = req.body;

  // Check if all fields are provided
  if (!full_name || !email || !password) {
    return res.status(400).json({ message: 'Please fill all fields' });
  }

  // Check if user already exists
  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (results.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash the password and store user data
    const hashedPassword = await bcrypt.hash(password, 10);
    db.query(
      'INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)',
      [full_name, email, hashedPassword],
      (err) => {
        if (err) return res.status(500).json({ message: 'Signup failed' });
        return res.status(200).json({ message: 'User registered successfully' });
      }
    );
  });
});
// Sign In Route (Simple Role-Based Auth for Frontend)
router.post('/signin', async (req, res) => {
  const { email, password } = req.body;

  try {
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: 'Server error during login' });
      }

      if (results.length === 0) {
        return res.status(401).json({ message: 'User not found' });
      }

      const user = results[0];

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Return user details to frontend for role-based routing
      return res.status(200).json({
        message: 'Login successful',
        user: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          is_admin: user.is_admin // true or false
        }
      });
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error during login' });
  }
});


// ===================== Raise a Concern =====================
router.post('/raise-concern', upload.single('image'), (req, res) => {
  const { email, item_name, category, date, location, description, itemType } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  // Ensure all fields are present
  if (!email || !item_name || !category || !date || !location || !description || !itemType || !imagePath) {
    return res.status(400).json({ message: 'Please fill all fields including image' });
  }

  // Get user ID based on email
  db.query('SELECT id FROM users WHERE email = ?', [email], (err, result) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (result.length === 0) return res.status(404).json({ message: 'User not found' });

    const userId = result[0].id;

    // Insert concern into DB
    const insertQuery = `
      INSERT INTO concerns (user_id, item_name, category, date, location, description, image, status, item_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `;

    db.query(
      insertQuery,
      [userId, item_name, category, date, location, description, imagePath, itemType],
      (err) => {
        if (err) {
          console.error("Error inserting concern:", err);
          return res.status(500).json({ message: 'Failed to submit concern' });
        }
        return res.status(200).json({ message: 'Concern submitted successfully' });
      }
    );
  });
});

// ===================== Get My Items =====================
router.get('/my-items', (req, res) => {
  const userEmail = req.query.email;
  if (!userEmail) return res.status(400).json({ message: 'Email is required' });

  db.query('SELECT id FROM users WHERE email = ?', [userEmail], (err, result) => {
    if (err) return res.status(500).json({ message: 'Database error (user lookup)' });
    if (result.length === 0) return res.status(404).json({ message: 'User not found' });

    const userId = result[0].id;

    // Fetch all concerns for the user
    db.query('SELECT * FROM concerns WHERE user_id = ?', [userId], (err, results) => {
      if (err) return res.status(500).json({ message: 'Database error (concerns lookup)' });
      return res.status(200).json({ items: results });
    });
  });
});

// ===================== Update Item =====================
router.put('/update-item/:id', (req, res) => {
  const { item_name, category, date, location, description } = req.body;
  const itemId = req.params.id;

  const updateQuery = `
    UPDATE concerns 
    SET item_name = ?, category = ?, date = ?, location = ?, description = ?
    WHERE id = ?
  `;

  db.query(updateQuery, [item_name, category, date, location, description, itemId], (err) => {
    if (err) {
      console.error("Update error:", err);
      return res.status(500).json({ message: 'Failed to update item' });
    }
    return res.status(200).json({ message: 'Item updated successfully' });
  });
});

// ===================== Delete Item =====================
router.delete('/delete-item/:id', (req, res) => {
  const itemId = req.params.id;

  const deleteQuery = `DELETE FROM concerns WHERE id = ?`;
  db.query(deleteQuery, [itemId], (err) => {
    if (err) return res.status(500).json({ message: 'Failed to delete item' });
    return res.status(200).json({ message: 'Item deleted successfully' });
  });
});

// ===================== Get All Items =====================
router.get('/all-items', (req, res) => {
  const query = `SELECT id, item_name, category, date, location, description, image, status 
                 FROM concerns ORDER BY date DESC`;

  db.query(query, (err, result) => {
    if (err) {
      console.error("Error fetching all items:", err);
      return res.status(500).json({ message: 'Error fetching items' });
    }
    res.status(200).json({ items: result });
  });
});

// ===================== Get Lost Items =====================
router.get('/lost-items', (req, res) => {
  const { search, category, sortBy, page = 1, limit = 10 } = req.query;

  let query = `SELECT * FROM concerns WHERE item_type = 'lost' AND status = 'approved'`;

  // Apply search filter
  if (search) {
    query += ` AND (item_name LIKE '%${search}%' OR description LIKE '%${search}%')`;
  }

  // Apply category filter
  if (category) {
    query += ` AND category = '${category}'`;
  }

  // Sorting
  if (sortBy) {
    if (sortBy === 'date_asc') query += ' ORDER BY date ASC';
    else if (sortBy === 'date_desc') query += ' ORDER BY date DESC';
    else if (sortBy === 'name_asc') query += ' ORDER BY item_name ASC';
    else if (sortBy === 'name_desc') query += ' ORDER BY item_name DESC';
  } else {
    query += ' ORDER BY created_at DESC'; // Default sort
  }

  // Pagination
  const offset = (page - 1) * limit;
  query += ` LIMIT ${limit} OFFSET ${offset}`;

  console.log("Final SQL Query: ", query); // For debugging

  db.query(query, (err, results) => {
    if (err) {
      console.error("Database error: ", err);
      return res.status(500).json({ message: 'Error fetching lost items', error: err });
    }

    res.status(200).json(results);
  });
});

// ===================== Get Found Items =====================
router.get('/found-items', (req, res) => {
  const query = "SELECT * FROM concerns WHERE item_type = 'found' AND status = 'approved'";

  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching found items:", err);
      return res.status(500).json({ message: "Failed to fetch found items" });
    }
    res.status(200).json({ items: results });
  });
});

// ===================== Get Claimed Items by User =====================
router.get('/claimed-items', (req, res) => {
  const { email } = req.query;

  if (!email) return res.status(400).json({ message: "Email is required" });

  const query = `
    SELECT concern_id FROM claims
    JOIN users ON claims.user_id = users.id
    WHERE users.email = ?
  `;

  db.query(query, [email], (err, results) => {
    if (err) {
      console.error("Error fetching claimed items:", err);
      return res.status(500).json({ message: "Error fetching claimed items" });
    }

    res.status(200).json({ items: results });
  });
});

// ===================== Claim an Item =====================
router.post('/claim-item', (req, res) => {
  const { concern_id, email } = req.body;

  if (!concern_id || !email) {
    return res.status(400).json({ message: "Missing concern ID or email" });
  }

  const getUserQuery = "SELECT id FROM users WHERE email = ?";
  db.query(getUserQuery, [email], (err, userResults) => {
    if (err || userResults.length === 0) {
      console.error("User fetch error:", err);
      return res.status(404).json({ message: "User not found" });
    }

    const user_id = userResults[0].id;

    const insertQuery = "INSERT INTO claims (user_id, concern_id) VALUES (?, ?)";
    db.query(insertQuery, [user_id, concern_id], (err) => {
      if (err) {
        console.error("Claim insert error:", err);
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({ message: "Item already claimed" });
        }
        return res.status(500).json({ message: "Failed to claim item" });
      }

      res.status(200).json({ message: "Item claimed successfully" });
    });
  });
});

// ===================== Get Helpers =====================

// Route to fetch helpers who reported found items
router.get('/helpers', (req, res) => {
  const query = `
    SELECT u.full_name, u.email, COUNT(c.id) AS found_count
    FROM users u
    JOIN concerns c ON u.id = c.user_id
    WHERE c.item_type = 'found' AND c.status = 'approved'
    GROUP BY u.id
    ORDER BY found_count DESC;
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching helpers:', err);
      return res.status(500).json({ message: 'Failed to fetch helpers' });
    }

    // Send the list of helpers as the response
    res.json({ helpers: results });
  });
});

// ===================== Get Claimers =====================
router.get('/claimers', (req, res) => {
  const query = `
    SELECT u.full_name as user_name, ci.item_name, c.claimed_at, c.status
    FROM claims c
    JOIN users u ON c.user_id = u.id
    JOIN concerns ci ON c.concern_id = ci.id
  `;

  db.query(query, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error fetching claimers' });
    }
    const claimers = result;
    // Fetch items for filtering dropdown
    db.query('SELECT DISTINCT item_name FROM concerns', (err, itemsResult) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error fetching items' });
      }
      const items = itemsResult;
      res.json({ claimers, items });
    });
  });
});



module.exports = router;
