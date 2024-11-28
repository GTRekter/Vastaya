// Load environment variables
require('dotenv').config();
const grpc = require('@grpc/grpc-js'); // Using '@grpc/grpc-js'
const protoLoader = require('@grpc/proto-loader');

// Load the protobuf definition
const PROTO_PATH = './task.proto';

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const taskProto = grpc.loadPackageDefinition(packageDefinition).tasks;

// In-memory storage for tasks
let tasks = [
  {
    id: 1,
    name: 'Mock Task',
    description: 'This is a mock task for demonstration purposes',
    projectId: 1,
    status: 'open',
  },
];
let nextId = 2;

function createTask(call, callback) {
  const { name, description, projectId } = call.request;
  const newTask = {
    id: nextId++,
    name,
    description,
    projectId,
    status: 'open',
  };
  tasks.push(newTask);
  callback(null, { task: newTask });
}

function getTask(call, callback) {
  const { id } = call.request;
  const task = tasks.find((t) => t.id === id);
  if (!task) {
    return callback({
      code: grpc.status.NOT_FOUND,
      details: 'Task not found',
    });
  }
  callback(null, { task });
}

function updateTask(call, callback) {
  const { task } = call.request;
  const taskIndex = tasks.findIndex((t) => t.id === task.id);
  if (taskIndex === -1) {
    return callback({
      code: grpc.status.NOT_FOUND,
      details: 'Task not found',
    });
  }
  tasks[taskIndex] = task;
  callback(null, { task });
}

function deleteTask(call, callback) {
  const { id } = call.request;
  const taskIndex = tasks.findIndex((t) => t.id === id);
  if (taskIndex === -1) {
    return callback({
      code: grpc.status.NOT_FOUND,
      details: 'Task not found',
    });
  }
  tasks.splice(taskIndex, 1);
  callback(null, {});
}

function getTasks(call, callback) {
  callback(null, { tasks });
}

function getTasksByProjectId(call, callback) {
  const { projectId } = call.request;
  const projectTasks = tasks.filter((t) => t.projectId === projectId);
  if (projectTasks.length === 0) {
    return callback({
      code: grpc.status.NOT_FOUND,
      details: 'No tasks found for this project',
    });
  }
  callback(null, { tasks: projectTasks });
}

// Implement the UpdateTaskStatus RPC method
async function updateTaskStatus(call, callback) {
  const { id, status } = call.request;
  const taskIndex = tasks.findIndex((t) => t.id === id);
  if (taskIndex === -1) {
    return callback({
      code: grpc.status.NOT_FOUND,
      details: 'Task not found',
    });
  }
  tasks[taskIndex].status = status;

  const projectId = tasks[taskIndex].projectId;
  const projectTasks = tasks.filter((t) => t.projectId === projectId);
  const allCompleted = projectTasks.every((t) => t.status === 'completed');

  try {
    // Update the project's status via gRPC call to the Projects Microservice
    const projectClient = new projectsProto.ProjectService(
      process.env.PROJECTS_API_URL,
      grpc.credentials.createInsecure()
    );

    projectClient.UpdateProjectStatus(
      { id: projectId, status: allCompleted ? 'completed' : 'open' },
      (err, response) => {
        if (err) {
          console.error('Error updating project status:', err);
          return callback({
            code: grpc.status.INTERNAL,
            details: 'Failed to update project status',
          });
        }
        console.log(
          `Project ${projectId} marked as ${
            allCompleted ? 'completed' : 'open'
          }.`
        );
        callback(null, { task: tasks[taskIndex] });
      }
    );
  } catch (err) {
    console.error('Error updating project status:', err);
    return callback({
      code: grpc.status.INTERNAL,
      details: 'Failed to update project status',
    });
  }
}

// Create gRPC server and add services
const server = new grpc.Server();
server.addService(taskProto.TaskService.service, {
  CreateTask: createTask,
  GetTask: getTask,
  UpdateTask: updateTask,
  DeleteTask: deleteTask,
  GetTasks: getTasks,
  getTasksByProjectId: getTasksByProjectId,
  UpdateTaskStatus: updateTaskStatus,
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
