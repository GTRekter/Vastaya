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

// In-memory storage for projects
let projects = [
    {
        id: 1,
        name: "Mock Project",
        description: "This is a mock project for demonstration purposes",
        status: "open"
    }
    // {
    //     id: 2,
    //     name: "Mock Project Canary 02",
    //     description: "This is a mock project for demonstration purposes of Canary deployments",
    //     status: "closed"
    // },
    // {
    //     id: 3,
    //     name: "Mock Project Canary 03",
    //     description: "This is a mock project for demonstration purposes of Canary deployments",
    //     status: "closed"
    // }
];
let nextProjectId = 2;

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

// Create a new project
app.post("/", (req, res) => {
    const { name, description } = req.body;
    const newProject = { id: nextProjectId++, name, description, status: "open" };
    projects.push(newProject);
    res.status(201).json(newProject);
});

// Get all projects
app.get("/", (req, res) => {
    res.json(projects);
});

// Get a project by ID
app.get("/:id", (req, res) => {
    const { id } = req.params;
    const project = projects.find(p => p.id == id);
    if (!project) {
        return res.status(404).json({ error: "Project not found" });
    }
    res.json(project);
});

// Update a project by ID
app.put("/:id", (req, res) => {
    const { id } = req.params;
    const { name, description, status } = req.body;
    const projectIndex = projects.findIndex(p => p.id == id);
    if (projectIndex === -1) {
        return res.status(404).json({ error: "Project not found" });
    }
    projects[projectIndex] = { id: parseInt(id), name, description, status };
    res.json(projects[projectIndex]);
});

// Update a project status by ID
app.put("/:id/status", (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const projectIndex = projects.findIndex(p => p.id == id);
    if (projectIndex === -1) {
        return res.status(404).json({ error: "Project not found" });
    }
    projects[projectIndex].status = status;
    res.json(projects[projectIndex]);
});

// Delete a project by ID
app.delete("/:id", (req, res) => {
    const { id } = req.params;
    const projectIndex = projects.findIndex(p => p.id == id);
    if (projectIndex === -1) {
        return res.status(404).json({ error: "Project not found" });
    }
    projects.splice(projectIndex, 1);
    res.status(204).send();
});

// Return a report of the project status
app.get("/:id/report", (req, res) => {
    const { id } = req.params;
    fetch(`${process.env.TASKS_API_URL}/projects/${id}`)
        .then(response => response.json())
        .then(tasks => {
            const totalTasks = tasks.length;
            const completedTasks = tasks.filter(t => t.completed).length;
            const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
            res.json({
                projectId: id,
                totalTasks,
                completedTasks,
                progress: `${progress}%`
            });
        })
        .catch(err => res.status(500).json({ error: err.message }));
});

app.listen(port, () => {
    const datetime = new Date();
    const message = `Server running on Port: ${port}. Started at: ${datetime}`;
    console.log(message);
    console.log('This is the canary deployment version');
}).on('error', (err) => {
    console.error('Server error:', err);
});