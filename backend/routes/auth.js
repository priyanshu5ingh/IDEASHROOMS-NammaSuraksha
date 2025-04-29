const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const multer = require('multer');
const path = require('path');

// Set up multer for photo uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Helper to promisify db.run
function runAsync(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this); // 'this' contains lastID, changes, etc.
    });
  });
}

// Registration route
router.post('/register', async (req, res) => {
  try {
    const { email, username, password, name, phone } = req.body;

    // Check if all required fields are present
    if (!email || !username || !password || !name || !phone) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM users WHERE email = ? OR username = ?',
        [email, username],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (existingUser) {
      return res.status(400).json({ 
        error: existingUser.email === email 
          ? 'Email already registered' 
          : 'Username already taken' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log('Attempting to insert user:', email, username);
    const insertResult = await runAsync(
      'INSERT INTO users (email, username, password, name, phone) VALUES (?, ?, ?, ?, ?)',
      [email, username, hashedPassword, name, phone]
    );
    console.log('Insert result:', insertResult);

    res.json({ 
      message: 'User registered successfully',
      userId: insertResult.lastID 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message || 'Server error during registration' });
  }
});

// Login route
router.post('/login', (req, res) => {
  const { emailOrUsername, password } = req.body;

  if (!emailOrUsername || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide both email/username and password'
    });
  }

  // Check if user exists by email or username
  db.get(
    'SELECT * FROM users WHERE email = ? OR username = ?',
    [emailOrUsername, emailOrUsername],
    async (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({
          success: false,
          message: 'Login failed. Please try again.'
        });
      }

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found. Please register first.'
        });
      }

      try {
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
          return res.status(401).json({
            success: false,
            message: 'Invalid password'
          });
        }

        // Send user data (excluding password)
        const { password: _, ...userData } = user;
        res.json({
          success: true,
          message: 'Login successful',
          user: userData
        });
      } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
          success: false,
          message: 'Login failed. Please try again.'
        });
      }
    }
  );
});

// TEMPORARY: List all users (for debugging only)
router.get('/all-users', (req, res) => {
  db.all('SELECT * FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows);
  });
});

// Add to backend/routes/auth.js (for debugging only)

module.exports = router;