// Load environment variables
require('dotenv').config();

var express = require('express');
const mysql = require("mysql2/promise");
const bodyParser = require("body-parser");
const cors = require('cors');

var app = express();
var port = process.env.port || 1337;

// Database connection
const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
};
const pool = mysql.createPool(dbConfig);

// Enable CORS for all routes
app.use(cors()); 

// Middleware
app.use(bodyParser.json());

// Health check endpoint
app.get("/health", function (req, res) {
    res.json({ Status: "healthy" });
});

// Liveness probe endpoint
app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});
  
// Readiness probe endpoint
app.get('/readyz', (req, res) => {
    pool.query('SELECT 1')
      .then(() => res.status(200).send('OK'))
      .catch(() => res.status(500).send('Not OK'));
});

// Create a new user
app.post("/users", async (req, res) => {
    const { name, email } = req.body;
    try {
        const [result] = await pool.execute(
            "INSERT INTO users (name, email) VALUES (?, ?)",
            [name, email]
        );
        res.status(201).json({ id: result.insertId, name, email });
    } catch (err) {
        console.error("Error creating user", err.stack);
        res.status(500).json({ error: "Failed to create user" });
    }
});

// Get all users
app.get("/users", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM users");
        res.json(rows);
    } catch (err) {
        console.error("Error fetching users", err.stack);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

// Get a user by ID
app.get("/users/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error("Error fetching user", err.stack);
        res.status(500).json({ error: "Failed to fetch user" });
    }
});

// Update a user by ID
app.put("/users/:id", async (req, res) => {
    const { id } = req.params;
    const { name, email } = req.body;
    try {
        const [result] = await pool.execute("UPDATE users SET name = ?, email = ? WHERE id = ?",[name, email, id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json({ id, name, email });
    } catch (err) {
        console.error("Error updating user", err.stack);
        res.status(500).json({ error: "Failed to update user" });
    }
});

// Delete a user by ID
app.delete("/users/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.execute("DELETE FROM users WHERE id = ?", [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        res.status(204).send();
    } catch (err) {
        console.error("Error deleting user", err.stack);
        res.status(500).json({ error: "Failed to delete user" });
    }
});

app.listen(port, () => {
  const datetime = new Date();
  const message = `Server running on Port: ${port}. Started at: ${datetime}`;
  console.log(message);
});