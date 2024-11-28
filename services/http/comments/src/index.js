// Load environment variables
require('dotenv').config();

var express = require('express');
const bodyParser = require("body-parser");
const cors = require('cors');

var app = express();
var port = process.env.PORT || 80;

// Enable CORS for all routes
app.use(cors()); 

// Middleware
app.use(bodyParser.json());

// In-memory storage for comments
let comments = [
    {
        id: 1,
        author: "Ivan Porta",  // Tho replace name with author ID in the future
        content: "Mock Comment",
        taskId: 1
    }
];
let nextId = 2; 

const randomFailure = () => {
    return Math.random() < 0.2;
}

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
    res.status(200).send('OK');
});

// Create a new comment
app.post("/", (req, res) => {
    const { author, content, id } = req.body;
    const newComment = { id: nextId++, author, content, taskId: id };
    comments.push(newComment);
    res.status(201).json(newComment);
});

// Get all comments with a random failure rate of 20%
app.get("/", (req, res) => {
    if (randomFailure()) {
        return res.status(500).json({ error: "Random failure occurred" });
    }
    res.json(comments);
});

// Get all comments by task ID  with a random failure rate of 20%
app.get("/tasks/:id", (req, res) => {
    const { id } = req.params;
    if (randomFailure()) {
        return res.status(500).json({ error: "Random failure occurred" });
    }
    if (!id) {
        return res.status(400).json({ error: "Project ID is required" });
    }
    const taskComments = comments.filter(u => u.taskId == id);
    res.json(taskComments);
});

// Get a comment by ID with a random failure rate of 20%
app.get("/:id", (req, res) => {
    const { id } = req.params;
    if (randomFailure()) {
        return res.status(500).json({ error: "Random failure occurred" });
    }
    const comment = comments.find(u => u.id == id);
    if (!comment) {
        return res.status(404).json({ error: "Comment not found" });
    }
    res.json(comment);
});

// Get all comments related to a task with a random failure rate of 20%
app.get("/tasks/:id", (req, res) => {
    const { id } = req.params; 
    if (randomFailure()) {
        return res.status(500).json({ error: "Random failure occurred" });
    }
    const taskComments = comments.filter(comment => comment.taskId == id);
    if (taskComments.length === 0) {
        return res.status(404).json({ error: "No comments found for this task" });
    }
    res.json(taskComments);
});

// Update a comment content by ID 
app.put("/:id", (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    const commentIndex = comments.findIndex(u => u.id == id);
    if (commentIndex === -1) {
        return res.status(404).json({ error: "Comment not found" });
    }
    comments[commentIndex] = { id: parseInt(id), author: comments[commentIndex].author, content, taskId: comments[commentIndex].taskId };
    res.json(comments[commentIndex]);
});

// Delete a comment by ID
app.delete("/:id", (req, res) => {
    const { id } = req.params;
    const commentIndex = comments.findIndex(u => u.id == id);
    if (commentIndex === -1) {
        return res.status(404).json({ error: "Comment not found" });
    }
    comments.splice(commentIndex, 1);
    res.status(204).send();
});

app.listen(port, () => {
    const datetime = new Date();
    const message = `Server running on Port: ${port}. Started at: ${datetime}`;
    console.log(message);
}).on('error', (err) => {
    console.error('Server error:', err);
});