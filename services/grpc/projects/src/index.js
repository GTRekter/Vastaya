// Load environment variables
require('dotenv').config();
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// Load the protobuf definition
const PROTO_PATH = './projects.proto';

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const projectsProto = grpc.loadPackageDefinition(packageDefinition).projects;

// In-memory storage for projects
let projects = [
  {
    id: 1,
    name: 'Mock Project',
    description: 'This is a mock project for demonstration purposes',
    status: 'open',
  },
];
let nextId = 2;

function createProject (call, callback) {
    const { name, description } = call.request;
    const newProject = {
        id: nextId++,
        name,
        description,
        status: 'open',
    };
    projects.push(newProject);
    callback(null, { project: newProject });
}

function  getProjectById (call, callback) {
    const { id } = call.request;
    const project = projects.find((p) => p.id === id);
    if (!project) {
        return callback({
        code: grpc.status.NOT_FOUND,
        details: 'Project not found',
        });
    }
    callback(null, { project });
}

function updateProject (call, callback) {
    const { id, name, description, status } = call.request;
    const projectIndex = projects.findIndex((p) => p.id === id);
    if (projectIndex === -1) {
        return callback({
        code: grpc.status.NOT_FOUND,
        details: 'Project not found',
        });
    }
    projects[projectIndex] = { id, name, description, status };
    callback(null, { project: projects[projectIndex] });
}

function updateProjectStatus (call, callback) {
    const { id, status } = call.request;
    const projectIndex = projects.findIndex((p) => p.id === id);
    if (projectIndex === -1) {
      return callback({
        code: grpc.status.NOT_FOUND,
        details: 'Project not found',
      });
    }
    projects[projectIndex].status = status;
    callback(null, { project: projects[projectIndex] });
}

function getProjects (_, callback) {
    callback(null, { projects });
}

async function getProjectReport (call, callback) {
    const { id } = call.request;
    try {
      // Make a gRPC call to the Tasks Microservice to get tasks by project ID
      const taskProto = grpc.loadPackageDefinition(packageDefinition).tasks;
      const taskClient = new taskProto.TaskService(
        process.env.TASKS_API_URL,
        grpc.credentials.createInsecure()
      );

      taskClient.GetTasksByProjectId({ projectId: id }, (err, response) => {
        if (err) {
          return callback({
            code: grpc.status.INTERNAL,
            details: err.details || 'Error fetching tasks',
          });
        }
        const tasks = response.tasks;
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter((t) => t.status === 'completed')
          .length;
        const progress =
          totalTasks > 0
            ? `${((completedTasks / totalTasks) * 100).toFixed(2)}%`
            : '0%';
        callback(null, {
          projectId: id,
          totalTasks,
          completedTasks,
          progress,
        });
      });
    } catch (err) {
      callback({
        code: grpc.status.INTERNAL,
        details: err.message,
      });
    }
}

function deleteProject (call, callback) {
    const { id } = call.request;
    const projectIndex = projects.findIndex((p) => p.id === id);
    if (projectIndex === -1) {
      return callback({
        code: grpc.status.NOT_FOUND,
        details: 'Project not found',
      });
    }
    projects.splice(projectIndex, 1);
    callback(null, {});
}

function healthCheck (_, callback) {
    callback(null, { status: 'healthy' });
}

function livenessProbe (_, callback) {
  callback(null, { status: 'OK' });
}

function readinessProbe (_, callback) {
  callback(null, { status: 'OK' });
}

// Create gRPC server and add services
const server = new grpc.Server();
server.addService(projectsProto.ProjectService.service, {
  CreateProject: createProject,
  GetProjectById: getProjectById,
  UpdateProject: updateProject,
  UpdateProjectStatus: updateProjectStatus,
  GetProjects: getProjects,
  GetProjectReport: getProjectReport,
  DeleteProject: deleteProject,
  HealthCheck: healthCheck,
  LivenessProbe: livenessProbe,
  ReadinessProbe: readinessProbe,
});

// Start the server
const port = process.env.PORT || '50051';
server.bindAsync(
  `0.0.0.0:${port}`,
  grpc.ServerCredentials.createInsecure(),
  (err, bindPort) => {
    if (err) {
      console.error('Failed to start server:', err);
      return;
    }
    console.log(`Projects Microservice running on port ${bindPort}`);
    server.start();
  }
);
