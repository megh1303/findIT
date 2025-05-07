const express = require('express');
const router = express.Router();
const db = require('../db.config');
const sendMail = require('../utils/mailer');

// Approve or Reject a Concern with email notification
router.put('/concerns/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const getUserQuery = `
    SELECT users.email, concerns.item_name 
    FROM concerns 
    JOIN users ON concerns.user_id = users.id 
    WHERE concerns.id = ?
  `;

  db.query(getUserQuery, [id], (err, results) => {
    if (err || results.length === 0) {
      return res.status(500).json({ error: 'Failed to fetch user info' });
    }

    const { email, item_name } = results[0];

    const updateQuery = `UPDATE concerns SET status = ? WHERE id = ?`;
    db.query(updateQuery, [status, id], (err) => {
      if (err) return res.status(500).json({ error: 'Update failed' });

      const statusText = status === 'approved' ? 'Approved' : 'Rejected';
      const statusColor = status === 'approved' ? '#28a745' : '#dc3545';

      const message = `
        <table style="font-family: Arial, sans-serif; padding: 10px; border: 1px solid #ddd;">
          <tr>
            <td>
              <h2 style="color: #333;">🔔 findIT Concern Update</h2>
              <p>Your concern for <strong>${item_name}</strong> has been 
              <strong style="color: ${statusColor};">${statusText}</strong>.</p>
              <p>Check your dashboard for more information or updates.</p>
              <hr>
              <p style="font-size: 12px; color: #777;">This is an automated message from findIT.</p>
            </td>
          </tr>
        </table>
      `;

      sendMail(email, 'Update on Your Concern', message)
        .then(() => {
          res.json({ message: `Concern marked as ${status} and email sent.` });
        })
        .catch(mailErr => {
          console.error("Email Error:", mailErr);
          res.status(500).json({ error: 'Status updated, but email failed.' });
        });
    });
  });
});

// Approve or Reject a Claim with email to claimer & helper
router.put('/claims/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const getDetailsQuery = `
    SELECT 
      claimers.full_name AS claimer_name,
      claimers.email AS claimer_email,
      concerns.item_name,
      helpers.full_name AS helper_name,
      helpers.email AS helper_email
    FROM claims
    JOIN users AS claimers ON claims.user_id = claimers.id
    JOIN concerns ON claims.concern_id = concerns.id
    JOIN users AS helpers ON concerns.user_id = helpers.id
    WHERE claims.id = ?
  `;

  db.query(getDetailsQuery, [id], (err, results) => {
    if (err || results.length === 0) {
      return res.status(500).json({ error: 'Failed to fetch claim info' });
    }

    const {
      claimer_name, claimer_email,
      item_name, helper_name, helper_email
    } = results[0];

    const updateStatusQuery = `UPDATE claims SET status = ? WHERE id = ?`;

    db.query(updateStatusQuery, [status, id], (err) => {
      if (err) return res.status(500).json({ error: 'Failed to update claim status' });

      const statusText = status === 'approved' ? 'Approved' : 'Rejected';
      const color = status === 'approved' ? '#28a745' : '#dc3545';

      let claimerMsg = `
        <div style="font-family: Arial, sans-serif; border: 1px solid #ddd; padding: 16px;">
          <h2 style="color: #333;">📬 Claim Update from findIT</h2>
          <p>Your claim for <strong>${item_name}</strong> has been 
          <strong style="color: ${color};">${statusText}</strong>.</p>
      `;

      if (status === 'approved') {
        claimerMsg += `
          <p>Please contact the helper to collect your item:</p>
          <ul>
            <li><strong>Name:</strong> ${helper_name}</li>
            <li><strong>Email:</strong> ${helper_email}</li>
          </ul>
        `;
      }

      claimerMsg += `
          <hr>
          <p style="font-size: 12px; color: #777;">This is an automated message. Please do not reply.</p>
        </div>
      `;

      const helperMsg = `
        <div style="font-family: Arial, sans-serif; border: 1px solid #ddd; padding: 16px;">
          <h2 style="color: #333;">📦 Claim Approved</h2>
          <p>The item <strong>${item_name}</strong> you reported has been claimed.</p>
          <p>Please expect the following user to contact you:</p>
          <ul>
            <li><strong>Name:</strong> ${claimer_name}</li>
            <li><strong>Email:</strong> ${claimer_email}</li>
          </ul>
          <p>Please verify the person before handing over the item.</p>
          <hr>
          <p style="font-size: 12px; color: #777;">This is an automated message. Please do not reply.</p>
        </div>
      `;

      sendMail(claimer_email, 'Update on Your Claim', claimerMsg)
        .then(() => {
          if (status === 'approved') {
            return sendMail(helper_email, 'Item Claimed - Action Needed', helperMsg);
          }
        })
        .then(() => {
          res.json({ message: `Claim marked as ${status} and emails sent.` });
        })
        .catch(mailErr => {
          console.error('Email Error:', mailErr);
          res.status(500).json({ error: 'Status updated, but failed to send email(s).' });
        });
    });
  });
});

// Middleware to verify admin access
const verifyAdmin = (req, res, next) => {
  const userId = req.query.user_id;
  if (!userId) return res.status(400).json({ error: 'User ID required' });

  db.query('SELECT is_admin FROM users WHERE id = ?', [userId], (err, results) => {
    if (err || results.length === 0) {
      return res.status(500).json({ error: 'Database error or user not found' });
    }
    if (!results[0].is_admin) {
      return res.status(403).json({ error: 'Access denied: not an admin' });
    }
    next();
  });
};

// Dashboard Stats Route
router.get('/dashboard-stats', verifyAdmin, (req, res) => {
  const stats = {
    totalItems: 0,
    pendingConcerns: 0,
    verifiedClaims: 0,
    totalUsers: 0
  };

  const queries = [
    { key: 'totalItems', query: 'SELECT COUNT(*) AS count FROM concerns' },
    { key: 'pendingConcerns', query: "SELECT COUNT(*) AS count FROM concerns WHERE status = 'pending'" },
    { key: 'verifiedClaims', query: "SELECT COUNT(*) AS count FROM concerns WHERE status = 'approved'" },
    { key: 'totalUsers', query: 'SELECT COUNT(*) AS count FROM users' }
  ];

  let completed = 0;
  queries.forEach(q => {
    db.query(q.query, (err, results) => {
      if (!err && results.length > 0) {
        stats[q.key] = results[0].count;
      }
      completed++;
      if (completed === queries.length) {
        res.json(stats);
      }
    });
  });
});

// Get all concerns with user info
router.get('/concerns', (req, res) => {
  const query = `
    SELECT 
      concerns.*, users.full_name, users.email
    FROM concerns
    JOIN users ON concerns.user_id = users.id
    ORDER BY concerns.created_at DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching concerns:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});

// Items routes
router.get('/items', (req, res) => {
  const query = 'SELECT * FROM concerns ORDER BY created_at DESC';
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

router.put('/items/:id', (req, res) => {
  const { item_name, category, date, location, description = '', status } = req.body;

  const query = `
    UPDATE concerns 
    SET item_name = ?, category = ?, date = ?, location = ?, description = ?, status = ? 
    WHERE id = ?
  `;

  db.query(query, [item_name, category, date, location, description, status, req.params.id], (err) => {
    if (err) {
      console.error("Error updating item:", err);
      return res.status(500).json({ error: 'Update failed' });
    }
    res.json({ message: 'Item updated successfully' });
  });
});

router.delete('/items/:id', (req, res) => {
  const query = `DELETE FROM concerns WHERE id = ?`;
  db.query(query, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'Delete failed' });
    res.json({ message: 'Item deleted successfully' });
  });
});

// Get all pending claims
router.get('/claims', (req, res) => {
  const query = `
    SELECT 
      claims.id AS claim_id,
      claims.status AS claim_status,
      claims.claimed_at,
      users.full_name,
      users.email,
      concerns.item_name,
      concerns.category,
      concerns.location,
      concerns.date
    FROM claims
    JOIN concerns ON claims.concern_id = concerns.id
    JOIN users ON claims.user_id = users.id
    WHERE claims.status = 'pending'
    ORDER BY claims.claimed_at DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching claims:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});

module.exports = router;
