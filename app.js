

const express = require('express');
require('dotenv').config();
const app = express(); 




app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));


const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const nodemailer = require("nodemailer");
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
   filename: (req, file, cb) => {
     const orig = file.originalname || 'file';
     const safe = orig.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_.-]/g, '');
     const prefix = (file.fieldname || 'file').replace(/[^A-Za-z0-9_-]/g, '');
     cb(null, `${prefix}-${Date.now()}-${safe}`);
   }
 });
 const upload = multer({ storage });
app.use(cors());

console.log('Using database at:', path.resolve('./internship_new.db'));

const db = new sqlite3.Database('./internship_new.db');

// Use a small helper to create tables and add missing columns (safe ALTER TABLE ADD COLUMN)
function ensureTable(tableName, createSql, requiredColumns = []) {
db.run(createSql, (err) => {
    if (err) console.error(`[DB] Error creating table ${tableName}:`, err && err.message ? err.message : err);
  });
  db.all(`PRAGMA table_info(${tableName})`, (err, cols) => {
    if (err) {
      console.error(`[DB] Failed to read ${tableName} schema:`, err && err.message ? err.message : err);
      return;
    }
    const existing = Array.isArray(cols) ? cols.map(c => c.name) : [];
    requiredColumns.forEach(col => {
      if (!existing.includes(col.name)) {
          db.run(col.sql, (alterErr) => {
          if (alterErr) {
            console.error(`[DB] Failed to add column "${col.name}" to ${tableName}:`, alterErr && alterErr.message ? alterErr.message : alterErr);
          } else {
            console.log(`[DB] Column "${col.name}" added to ${tableName}`);
          }
        });
      }
    });
  });
}

ensureTable('students', `
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first TEXT,
    last TEXT,
    middle TEXT,
    ext TEXT,
    dept TEXT,
    studid TEXT,
    email TEXT UNIQUE,
    password TEXT,
    classId INTEGER
  )`);

ensureTable('admins', `
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first TEXT,
    last TEXT,
    email TEXT UNIQUE,
    password TEXT
  )`);

ensureTable('otps', `
  CREATE TABLE IF NOT EXISTS otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    code TEXT,
    expiresAt INTEGER
  )`);

ensureTable('collaborators', `
  CREATE TABLE IF NOT EXISTS collaborators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    courseId INTEGER,
    email TEXT,
    role TEXT
  )`);

 ensureTable('classes', `
   CREATE TABLE IF NOT EXISTS classes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     course TEXT,
     section TEXT,
     hours INTEGER,
     admin TEXT
   )`);
 
 ensureTable('departments', `
 CREATE TABLE IF NOT EXISTS departments (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
 )`);
 
 ensureTable('departments', `
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  );`);

ensureTable('requirements', `
  CREATE TABLE IF NOT EXISTS requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    studentId TEXT,
    type TEXT,
    filename TEXT,
    uploadedAt INTEGER
  )`);
   
ensureTable('dailylogs', `
   CREATE TABLE IF NOT EXISTS dailylogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    date TEXT,
    title TEXT,
    desc TEXT,
    img TEXT,
    comments TEXT DEFAULT '[]'
  )`, [
    { name: 'userId', sql: `ALTER TABLE dailylogs ADD COLUMN userId INTEGER` },
    { name: 'date', sql: `ALTER TABLE dailylogs ADD COLUMN date TEXT` },
    { name: 'title', sql: `ALTER TABLE dailylogs ADD COLUMN title TEXT` },
    { name: 'desc', sql: `ALTER TABLE dailylogs ADD COLUMN desc TEXT` },
    { name: 'img', sql: `ALTER TABLE dailylogs ADD COLUMN img TEXT` },
    { name: 'comments', sql: `ALTER TABLE dailylogs ADD COLUMN comments TEXT DEFAULT '[]'` }
  ]);

// Ensure faqs table and columns (fixes "no column named userId")
ensureTable('faqs', `
  CREATE TABLE IF NOT EXISTS faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    userName TEXT,
    date TEXT,
    question TEXT,
    img TEXT,
    comments TEXT DEFAULT '[]'
  )`, [
    { name: 'userId', sql: `ALTER TABLE faqs ADD COLUMN userId INTEGER` },
    { name: 'userName', sql: `ALTER TABLE faqs ADD COLUMN userName TEXT` },
    { name: 'date', sql: `ALTER TABLE faqs ADD COLUMN date TEXT` },
    { name: 'question', sql: `ALTER TABLE faqs ADD COLUMN question TEXT` },
    { name: 'img', sql: `ALTER TABLE faqs ADD COLUMN img TEXT` },
    { name: 'comments', sql: `ALTER TABLE faqs ADD COLUMN comments TEXT DEFAULT '[]'` }
  ]);

// --- List Departments ---
app.get('/api/departments', (req, res) => {
  db.all(`SELECT * FROM departments ORDER BY name`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- Add Department ---
app.post('/api/departments', (req, res) => {
  const { name } = req.body;
  db.run(`INSERT INTO departments (name) VALUES (?)`, [name], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name });
  });
});

// --- Edit Department ---
app.put('/api/departments/:id', (req, res) => {
  const { name } = req.body;
  db.run(`UPDATE departments SET name = ? WHERE id = ?`, [name, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes });
  });
});

// --- Delete Department ---
app.delete('/api/departments/:id', (req, res) => {
  db.run(`DELETE FROM departments WHERE id = ?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

  // Insert default admin if not exists
  db.get(`SELECT * FROM admins WHERE email = ?`, ['admin@slsu.edu.ph'], (err, row) => {
    if (err) {
      console.error('Error checking for default admin:', err.message);
      return;
    }
    if (!row) {
      db.run(
        `INSERT INTO admins (first, last, email, password) VALUES (?, ?, ?, ?)`,
        ['Admin', 'User', 'admin@slsu.edu.ph', 'admin123'],
        (err) => {
          if (err) {
            console.error('Error creating default admin:', err.message);
            return;
          }
          console.log('Default admin created');
        }
      );
    }
  });

app.post('/api/login', (req, res) => {
  const { schoolId, password, email } = req.body;

  // Admin login (email + password)
  if (email && password) {
    db.get(`SELECT * FROM admins WHERE email = ? AND password = ?`, [email, password], (err, adminRow) => {
      if (err) return res.status(500).json({ error: err.message });
      if (adminRow) {
        db.all(`SELECT * FROM collaborators`, [], (err, collaboratorRows) => {
          if (err) return res.status(500).json({ error: err.message });
          return res.json({
            token: 'admin-token-123',
            role: 'admin',
            user: { id: adminRow.id, email: adminRow.email },
            collaborators: collaboratorRows
          });
        });
        return;
      }
      return res.status(401).json({ error: "Invalid admin credentials" });
    });
    return;
  }

  // Student login (schoolId + password)
  if (schoolId && password) {
    db.get(`SELECT * FROM students WHERE studid = ? AND password = ?`, [schoolId, password], (err, studentRow) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!studentRow) {
        return res.status(401).json({ error: 'Invalid School ID or password' });
      }
      return res.json({
        token: 'student-token-123',
        role: 'student',
        user: {
          id: studentRow.id,
          studid: studentRow.studid,
          first: studentRow.first,
          last: studentRow.last,
          dept: studentRow.dept,
          email: studentRow.email
        }
      });
    });
    return;
  }

  // If neither, missing credentials
  return res.status(400).json({ error: "Missing credentials" });
});

// Create Admin
app.post("/api/admins", (req, res) => {
  const { first, last, email, password, securityCode } = req.body;

  db.get(
    `SELECT * FROM otps WHERE email = ? ORDER BY id DESC LIMIT 1`,
    [email],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });

      if (!row) return res.status(400).json({ error: "No OTP requested" });
      if (row.code !== securityCode)
        return res.status(403).json({ error: "Invalid OTP" });
      if (Date.now() > row.expiresAt)
        return res.status(403).json({ error: "OTP expired" });

      // OTP valid → insert admin
      db.run(
        `INSERT INTO admins (first, last, email, password) VALUES (?, ?, ?, ?)`,
        [first, last, email, password],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ id: this.lastID, message: "Admin created successfully" });
        }
      );
    }
  );
});

// List Admins
app.get('/api/admins', (req, res) => {
  db.all(`SELECT id, first, last, email FROM admins`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

/// --- nodemailer transport setup (replace the old block) ---
let transporter = null;
let etherealAccount = null;

// Allow opt-in for self-signed certs via SMTP_ALLOW_SELF_SIGNED environment variable.
// SECURITY: only use SMTP_ALLOW_SELF_SIGNED=true for development / internal servers you trust.
const allowSelfSigned = (process.env.SMTP_ALLOW_SELF_SIGNED === 'true');

if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
  // No SMTP provided — create an Ethereal test account for local development
  nodemailer.createTestAccount()
    .then(account => {
      etherealAccount = account;
      transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass },
        tls: { rejectUnauthorized: !allowSelfSigned } // allow self-signed if configured
      });
      console.log('Using Ethereal test SMTP account (dev). Preview URLs will be available for sent messages.');
      console.log('Ethereal user:', account.user);
    })
    .catch(err => {
      console.error('Failed to create Ethereal account for nodemailer:', err);
    });
} else {
 const transportOptions = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for 587
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls: { rejectUnauthorized: !allowSelfSigned }
};
transporter = nodemailer.createTransport(transportOptions);

  // verify connection configuration early and log helpful details
  transporter.verify()
    .then(() => {
      console.log('Using SMTP transport with user:', process.env.SMTP_USER, 'allowSelfSigned=', allowSelfSigned);
    })
    .catch(err => {
      console.error('nodemailer verify failed:', err && err.message ? err.message : err);
      // still keep transporter; sendMail will show specific errors
    });
}

// Request OTP (stores OTP and attempts to send email; returns preview URL when using Ethereal)
app.post("/api/request-otp", (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Missing email" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  db.run(
    `INSERT INTO otps (email, code, expiresAt) VALUES (?, ?, ?)`,
    [email, otp, expiresAt],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      // Prepare mail options
      const mailFrom = process.env.SMTP_FROM || (etherealAccount ? etherealAccount.user : `no-reply@example.com`);
      const mailOptions = { 
        from: mailFrom, 
        to: email, 
        subject: "Your Admin OTP Code",
        text: `Your OTP is ${otp}. It will expire in 5 minutes.`
      };

      if (!transporter) {
        // transporter not ready (e.g. Ethereal account still being created)
        console.warn('Transporter not ready — OTP stored but mail not sent yet.');
        return res.json({ message: "OTP stored; email transporter not ready yet (check server logs)." });
      }

      // Send email and return helpful response including test preview URL if available
      transporter.sendMail(mailOptions)
        .then(info => {
          let previewUrl = null;
          try { previewUrl = nodemailer.getTestMessageUrl(info); } catch (e) {}
          const resp = { message: "OTP sent to email" };
          if (previewUrl) resp.previewUrl = previewUrl;
          return res.json(resp);
        })
        .catch(sendErr => {
          console.error('Failed to send OTP email:', sendErr);
          // OTP is already in DB; respond with a non-fatal message
          return res.status(200).json({
            message: "OTP stored but failed to send email",
            error: sendErr.message
          });
        });
    }
  );
});

// Add collaborator
app.post("/api/collaborators", (req, res) => {
  const { courseId, email, role } = req.body;
  db.run(
    `INSERT INTO collaborators (courseId, email, role) VALUES (?, ?, ?)`,
    [courseId, email, role],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: "Collaborator added successfully" });
    }
  );
});

// List collaborators for a course
app.get("/api/collaborators/:courseId", (req, res) => {
  const { courseId } = req.params;
  db.all(
    `SELECT * FROM collaborators WHERE courseId = ?`,
    [courseId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Add this near other collaborator endpoints in app.js (server-side)
app.delete('/api/collaborators/:id', (req, res) => {
  const id = req.params.id;
  db.run(`DELETE FROM collaborators WHERE id = ?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    // return how many rows were deleted
    res.json({ deleted: this.changes });
  });
});

// List students
app.get('/api/students', (req, res) => {
  db.all(`SELECT * FROM students`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get a single student
app.get('/api/students/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM students WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Student not found' });
    res.json(row);
  });
});

// Update student - allows partial updates, including password and classId
app.put('/api/students/:id', (req, res) => {
  const id = req.params.id;
  const allowedFields = [
    "first", "last", "middle", "ext", "dept", "section", "studid", "email", "password", "classId"
  ];
  const updateFields = [];
  const updateValues = [];

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updateFields.push(`${field} = ?`);
      updateValues.push(req.body[field]);
    }
  });

  if (updateFields.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  updateValues.push(id);

  db.run(
    `UPDATE students SET ${updateFields.join(", ")} WHERE id = ?`,
    updateValues,
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    }
  );
});

// Delete student
app.delete('/api/students/:id', (req, res) => {
  const id = req.params.id;
  db.run(`DELETE FROM students WHERE id = ?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// Create class
app.post('/api/classes', (req, res) => {
  const { course, section, hours, admin } = req.body;
  db.run(
    `INSERT INTO classes (course, section, hours, admin) VALUES (?, ?, ?, ?)`,
    [course, section, hours, admin],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// Get all classes (optionally filter by admin OR include classes assigned to collaborator)
// Returns classes with an extra boolean-like field `assignedOnly`:
//   0 => class was created/owned by the given admin (classes.admin = email)
//   1 => class was assigned to the given email via collaborators (they are a collaborator)
app.get('/api/classes', (req, res) => {
  const admin = req.query.admin;

  if (admin) {
    const sql = `
      SELECT c.*,
        CASE
          WHEN c.admin = ? THEN 0
          WHEN EXISTS(
            SELECT 1 FROM collaborators col WHERE col.courseId = c.id AND col.email = ?
          ) THEN 1
          ELSE 0
        END AS assignedOnly
      FROM classes c
      WHERE c.admin = ?
        OR EXISTS(
          SELECT 1 FROM collaborators col WHERE col.courseId = c.id AND col.email = ?
        )
      ORDER BY c.course, c.section
    `;
    // params: admin repeated for the 4 placeholders above
    db.all(sql, [admin, admin, admin, admin], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
    return;
  }

  // No admin filter — return all classes (legacy behavior)
  db.all('SELECT * FROM classes', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get single class (improved)
app.get('/api/classes/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM classes WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: `Class with ID ${id} not found` });
    res.json(row);
  });
});

// Update class
app.put('/api/classes/:id', (req, res) => {
  const { course, section, hours } = req.body;
  db.run(
    `UPDATE classes SET course = ?, section = ?, hours = ? WHERE id = ?`,
    [course, section, hours, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    }
  );
});

// Delete class
app.delete('/api/classes/:id', (req, res) => {
  db.run('DELETE FROM classes WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// Enroll student
app.post('/api/students', (req, res) => {
  const { first, last, middle, ext, dept, studid, email, password, classId } = req.body;
  db.run(
    `INSERT INTO students (first, last, middle, ext, dept, studid, email, password, classId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [first, last, middle, ext, dept, studid, email, password, classId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// Get all students
app.get('/api/students', (req, res) => {
  db.all('SELECT * FROM students', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get students by classId
app.get('/api/classes/:id/students', (req, res) => {
  db.all('SELECT * FROM students WHERE classId = ?', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Update student (move between classes)
app.put('/api/students/:id', (req, res) => {
  const id = req.params.id;
  const allowedFields = [
    "first", "last", "middle", "ext", "dept", "studid", "email", "password", "classId"
  ];
  const updateFields = [];
  const updateValues = [];

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updateFields.push(`${field} = ?`);
      updateValues.push(req.body[field]);
    }
  });

  if (updateFields.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }
  updateValues.push(id);

  db.run(
    `UPDATE students SET ${updateFields.join(", ")} WHERE id = ?`,
    updateValues,
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    }
  );
});

// Delete student
app.delete('/api/students/:id', (req, res) => {
  db.run('DELETE FROM students WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.post('/api/requirements', upload.single('file'), (req, res) => {
  const { studentId, type } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  db.run(
    `INSERT INTO requirements (studentId, type, filename, uploadedAt) VALUES (?, ?, ?, ?)`,
    [studentId, type, req.file.filename, Date.now()],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      // return studentId and type so frontend can update UI/admin accurately
      res.json({ id: this.lastID, filename: req.file.filename, studentId, type });
    }
  );
});

app.get('/api/requirements', (req, res) => {
  db.all(`SELECT * FROM requirements`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/requirements/:studentId', (req, res) => {
  db.all(`SELECT * FROM requirements WHERE studentId = ?`, [req.params.studentId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.use('/requirements', express.static(uploadDir));

// CREATE/ADD a daily log
app.post('/api/dailylogs', (req, res) => {
  const { userId, date, title, desc, img, comments } = req.body;
  db.run(
    `INSERT INTO dailylogs (userId, date, title, desc, img, comments) VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, date, title, desc, img, JSON.stringify(comments || [])],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// GET all daily logs for a user
app.get('/api/dailylogs/:userId', (req, res) => {
  db.all(
    `SELECT * FROM dailylogs WHERE userId = ? ORDER BY date DESC`,
    [req.params.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      rows.forEach(r => r.comments = JSON.parse(r.comments || "[]"));
      res.json(rows);
    }
  );
});

// Add this endpoint so admin can fetch ALL daily logs
app.get('/api/dailylogs', (req, res) => {
  db.all(`SELECT * FROM dailylogs ORDER BY date DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // parse comments JSON safely
    rows.forEach(r => {
      try { r.comments = JSON.parse(r.comments || "[]"); } catch (e) { r.comments = []; }
    });
    res.json(rows);
  });
});

// UPDATE a daily log (edit log or add comment)
app.put('/api/dailylogs/:id', (req, res) => {
  const { title, desc, img, comments } = req.body;
  db.run(
    `UPDATE dailylogs SET title = ?, desc = ?, img = ?, comments = ? WHERE id = ?`,
    [title, desc, img, JSON.stringify(comments || []), req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    }
  );
});

// DELETE a daily log
app.delete('/api/dailylogs/:id', (req, res) => {
  db.run(
    `DELETE FROM dailylogs WHERE id = ?`,
    [req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ deleted: this.changes });
    }
  );
});

app.post('/api/faqs', (req, res) => {
  // Log incoming request for debugging
  console.log('[SERVER] POST /api/faqs - body keys:', Object.keys(req.body || {}));
  console.log('[SERVER] POST /api/faqs - body preview:', {
    userId: req.body && req.body.userId,
    userName: req.body && req.body.userName,
    questionLength: req.body && req.body.question ? req.body.question.length : 0,
    hasImg: !!(req.body && req.body.img)
  });

  const { userId, userName, date, question, img, comments } = req.body || {};
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'Missing question text' });
  }

  db.run(
    `INSERT INTO faqs (userId, userName, date, question, img, comments) VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, userName, date, question, img || '', JSON.stringify(comments || [])],
    function(err) {
      if (err) {
        console.error('[SERVER] /api/faqs DB error:', err && err.message ? err.message : err);
        return res.status(500).json({ error: 'Failed to save question: ' + (err && err.message ? err.message : '') });
      }
      console.log('[SERVER] /api/faqs inserted id=', this.lastID);
      return res.json({ id: this.lastID });
    }
  );
});

// Get all FAQs, newest first
app.get('/api/faqs', (req, res) => {
  db.all('SELECT * FROM faqs ORDER BY date DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    rows.forEach(r => r.comments = JSON.parse(r.comments || "[]"));
    res.json(rows);
  });
});

// Add a comment/answer (update FAQ post)
app.put('/api/faqs/:id', (req, res) => {
  const { comments } = req.body;
  db.run(
    `UPDATE faqs SET comments = ? WHERE id = ?`,
    [JSON.stringify(comments || []), req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    }
  );
});

// --- OJT LOGS TABLE ---
db.run(`CREATE TABLE IF NOT EXISTS ojtlogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER,
  clockIn TEXT,
  clockOut TEXT,
  photo TEXT
)`);

// Add a log (clock-in)
app.post('/api/ojtlogs', (req, res) => {
  const { userId, clockIn, photo } = req.body;
  db.run(
    `INSERT INTO ojtlogs (userId, clockIn, photo) VALUES (?, ?, ?)`,
    [userId, clockIn, photo],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// Update a log (clock-out)
app.put('/api/ojtlogs/:id', (req, res) => {
  const { clockOut } = req.body;
  db.run(
    `UPDATE ojtlogs SET clockOut = ? WHERE id = ?`,
    [clockOut, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    }
  );
});

// Get all logs for a user
app.get('/api/ojtlogs/:userId', (req, res) => {
  db.all(`SELECT * FROM ojtlogs WHERE userId = ? ORDER BY clockIn DESC`, [req.params.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// DEBUG - development only: return the last OTP for an email (REMOVE in production)
app.get('/api/debug/last-otp/:email', (req, res) => {
  const email = req.params.email;
  db.get(
    `SELECT id, email, code, expiresAt FROM otps WHERE email = ? ORDER BY id DESC LIMIT 1`,
    [email],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'OTP not found' });
      return res.json({ id: row.id, email: row.email, code: row.code, expiresAt: row.expiresAt });
    }
  );
});

app.get('/api/classes/:id/admins', (req, res) => {
  const courseId = req.params.id;
  db.all('SELECT * FROM collaborators WHERE courseId = ?', [courseId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/admins/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  db.get(`SELECT * FROM admins WHERE email = ?`, [email], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    // Always respond with success for privacy, even if not found:
    if (!row) return res.json({ message: 'If your email is registered, a reset link has been sent.' });

    // Generate token and expiry
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    // Save token and expiry
    db.run(`UPDATE admins SET reset_token = ?, reset_expires = ? WHERE email = ?`, [token, expiresAt, email], function(err2) {
      if (err2) return res.status(500).json({ error: err2.message });

      // Compose reset link
      const resetLink = `http://localhost:4000/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

      // Compose email
      const mailOptions = {
        from: process.env.SMTP_FROM,
        to: email,
        subject: "SLSU Admin Password Reset",
        html: `
          <p>Hi ${row.first || ''},</p>
          <p>To reset your password, click the link below. This link will expire in 15 minutes:</p>
          <a href="${resetLink}">${resetLink}</a>
          <p>If you did not request a reset, please ignore this email.</p>
        `
      };

      // Send email
      transporter.sendMail(mailOptions, (e, info) => {
        if (e) {
          console.error('Failed to send reset email:', e);
          return res.status(500).json({ error: 'Failed to send reset email.' });
        }
        res.json({ message: 'If your email is registered, a reset link has been sent.' });
      });
    });
  });
});

// Add this endpoint near your other admin routes (before app.listen).
// It deletes only the requesting admin account and the data owned by that admin.
app.post('/api/admins/delete-my-account', (req, res) => {
  // Prefer bearer token but allow fallback to email/password for verification
  const auth = req.headers['authorization'] || req.headers['Authorization'] || '';
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  let adminEmailFromToken = null;
  if (m) adminEmailFromToken = adminTokens && adminTokens[m[1]] ? adminTokens[m[1]] : null;

  const { email, password, confirm } = req.body || {};

  if (confirm !== 'DELETE_ACCOUNT') {
    return res.status(400).json({ error: 'Missing explicit confirmation. Send confirm: "DELETE_ACCOUNT"' });
  }

  // Helper: perform the destructive cleanup for a verified adminEmail and admin id
  function performCleanup(adminRow) {
    if (!adminRow) return res.status(404).json({ error: 'Admin not found' });

    const adminEmail = adminRow.email;
    const adminId = adminRow.id;

    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (beginErr) => {
        if (beginErr) {
          console.error('BEGIN TRANSACTION failed', beginErr);
          return res.status(500).json({ error: 'Failed to begin DB transaction' });
        }

        // 1) Find classes owned by this admin
        db.all(`SELECT id FROM classes WHERE admin = ?`, [adminEmail], (err, classRows) => {
          if (err) {
            console.error('Failed to fetch classes for admin', err);
            return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed to fetch classes' }));
          }

          const classIds = classRows.map(r => r.id);
          const placeholdersClasses = classIds.length ? classIds.map(() => '?').join(',') : null;

          // 2) Find students in those classes
          const getStudents = (cb) => {
            if (!placeholdersClasses) return cb(null, []);
            db.all(`SELECT id FROM students WHERE classId IN (${placeholdersClasses})`, classIds, (e, studentRows) => {
              if (e) return cb(e);
              cb(null, studentRows.map(s => s.id));
            });
          };

          getStudents((studentErr, studentIds) => {
            if (studentErr) {
              console.error('Failed to fetch students', studentErr);
              return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed to fetch students' }));
            }

            const placeholdersStudents = studentIds.length ? studentIds.map(() => '?').join(',') : null;

            // 3) Delete collaborators for those classes
            const deleteCollaborators = (done) => {
              if (!placeholdersClasses) return done();
              db.run(`DELETE FROM collaborators WHERE courseId IN (${placeholdersClasses})`, classIds, function (dcErr) {
                if (dcErr) return done(dcErr);
                done();
              });
            };

            // 4) Delete requirements rows and remove uploaded files for those students
            const deleteRequirementsAndFiles = (done) => {
              if (!placeholdersStudents) return done();
              db.all(`SELECT filename FROM requirements WHERE studentId IN (${placeholdersStudents})`, studentIds, (rqErr, reqRows) => {
                if (rqErr) return done(rqErr);

                // remove files (best-effort)
                try {
                  reqRows.forEach(r => {
                    if (r && r.filename) {
                      const fp = path.join(uploadDir, r.filename);
                      try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { /* ignore per-file errors */ }
                    }
                  });
                } catch (e) {
                  console.warn('Error while deleting requirement files:', e);
                }

                db.run(`DELETE FROM requirements WHERE studentId IN (${placeholdersStudents})`, studentIds, function (dreqErr) {
                  if (dreqErr) return done(dreqErr);
                  done();
                });
              });
            };

            // 5) Delete dailylogs for those students
            const deleteDailyLogs = (done) => {
              if (!placeholdersStudents) return done();
              db.run(`DELETE FROM dailylogs WHERE userId IN (${placeholdersStudents})`, studentIds, function (errDL) {
                if (errDL) return done(errDL);
                done();
              });
            };

            // 6) Delete ojtlogs for those students
            const deleteOjtLogs = (done) => {
              if (!placeholdersStudents) return done();
              db.run(`DELETE FROM ojtlogs WHERE userId IN (${placeholdersStudents})`, studentIds, function (errOJ) {
                if (errOJ) return done(errOJ);
                done();
              });
            };

            // 7) Delete faqs posted by those students
            const deleteFaqs = (done) => {
              if (!placeholdersStudents) return done();
              db.run(`DELETE FROM faqs WHERE userId IN (${placeholdersStudents})`, studentIds, function (errF) {
                if (errF) return done(errF);
                done();
              });
            };

            // 8) Delete students themselves
            const deleteStudents = (done) => {
              if (!placeholdersStudents) return done();
              db.run(`DELETE FROM students WHERE id IN (${placeholdersStudents})`, studentIds, function (errS) {
                if (errS) return done(errS);
                done();
              });
            };

            // 9) Delete classes owned by admin
            const deleteClasses = (done) => {
              if (!placeholdersClasses) return done();
              db.run(`DELETE FROM classes WHERE id IN (${placeholdersClasses})`, classIds, function (errC) {
                if (errC) return done(errC);
                done();
              });
            };

            // 10) Remove any collaborator rows that reference this admin as email in collaborators.email (optional)
            const deleteCollaboratorRowsByEmail = (done) => {
              db.run(`DELETE FROM collaborators WHERE email = ?`, [adminEmail], function (errCol2) {
                if (errCol2) return done(errCol2);
                done();
              });
            };

            // 11) Finally delete the admin row itself
            const deleteAdminRow = (done) => {
              db.run(`DELETE FROM admins WHERE id = ?`, [adminId], function (errA) {
                if (errA) return done(errA);
                done();
              });
            };

            // chain calls in order
            deleteCollaborators((err1) => {
              if (err1) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed to delete collaborators' }));
              deleteRequirementsAndFiles((err2) => {
                if (err2) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed to delete requirements' }));
                deleteDailyLogs((err3) => {
                  if (err3) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed to delete daily logs' }));
                  deleteOjtLogs((err4) => {
                    if (err4) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed to delete ojt logs' }));
                    deleteFaqs((err5) => {
                      if (err5) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed to delete faqs' }));
                      deleteStudents((err6) => {
                        if (err6) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed to delete students' }));
                        deleteClasses((err7) => {
                          if (err7) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed to delete classes' }));
                          deleteCollaboratorRowsByEmail((err8) => {
                            if (err8) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed final collaborator cleanup' }));
                            deleteAdminRow((err9) => {
                              if (err9) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed to delete admin' }));
                              db.run('COMMIT', (commitErr) => {
                                if (commitErr) {
                                  console.error('COMMIT failed', commitErr);
                                  return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed to commit changes' }));
                                }

                                // Also remove any active tokens for that admin (best-effort)
                                if (adminTokens) {
                                  Object.keys(adminTokens).forEach(t => {
                                    if (adminTokens[t] === adminEmail) delete adminTokens[t];
                                  });
                                }

                                return res.json({ message: 'Admin account and owned data deleted successfully' });
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });

          }); // end select classes
        }); // end BEGIN
      });
    });
  } // end performCleanup

  // Verification: prefer token
  if (adminEmailFromToken) {
    // Lookup admin row by email
    db.get(`SELECT * FROM admins WHERE email = ?`, [adminEmailFromToken], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Admin not found for token' });
      return performCleanup(row);
    });
    return;
  }

  // Fallback: require email + password
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required when no token provided' });
  }

  db.get(`SELECT * FROM admins WHERE email = ? AND password = ?`, [email, password], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(403).json({ error: 'Invalid admin credentials' });
    performCleanup(row);
  });
});

app.delete('/api/faqs/:id', (req, res) => {
  db.run(`DELETE FROM faqs WHERE id = ?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.get('/', (req, res) => {
  res.send('SLSU OJT Monitoring System is running!');
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html on root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.listen(4000, () => console.log('Server running on port 4000'));







