// Load environment variables
require('dotenv').config();
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// Load the protobuf definition
const PROTO_PATH = './comments.proto';

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const commentsProto = grpc.loadPackageDefinition(packageDefinition).comments;

// In-memory storage
let comments = [
  {
    id: 1,
    author: 'Ivan Porta',
    content: 'Mock Comment',
    taskId: 1
  },
];
let nextId = 2;
const randomFailure = () => Math.random() < 0.2;

function createComment (call, callback) {
  const { author, content, taskId } = call.request;
  const newComment = { 
    id: nextId++, 
    author, 
    content, 
    taskId 
  };
  comments.push(newComment);
  callback(null, newComment);
}

function getComments (_, callback) {
  if (randomFailure()) {
    return callback({ code: grpc.status.INTERNAL, message: 'Random failure occurred' });
  }
  callback(null, { comments });
}

function getCommentsByTaskId (call, callback) {
  const { taskId } = call.request;
  if (randomFailure()) {
    return callback({ code: grpc.status.INTERNAL, message: 'Random failure occurred' });
  }
  const taskComments = comments.filter(comment => comment.taskId === taskId);
  callback(null, { comments: taskComments });
}

function getCommentById (call, callback) {
  const { id } = call.request;
  if (randomFailure()) {
    return callback({ code: grpc.status.INTERNAL, message: 'Random failure occurred' });
  }
  const comment = comments.find(comment => comment.id === id);
  if (!comment) {
    return callback({ code: grpc.status.NOT_FOUND, message: 'Comment not found' });
  }
  callback(null, comment);
}

function  updateComment (call, callback) {
  const { id, content } = call.request;
  const comment = comments.find(comment => comment.id === id);
  if (!comment) {
    return callback({ code: grpc.status.NOT_FOUND, message: 'Comment not found' });
  }
  comment.content = content;
  callback(null, comment);
}

function deleteComment (call, callback) {
  const { id } = call.request;
  const index = comments.findIndex(comment => comment.id === id);
  if (index === -1) {
    return callback({ code: grpc.status.NOT_FOUND, message: 'Comment not found' });
  }
  comments.splice(index, 1);
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
server.addService(commentsProto.CommentService.service, {
  CreateComment: createComment,
  GetComments: getComments,
  GetCommentsByTaskId: getCommentsByTaskId,
  GetCommentById: getCommentById,
  UpdateComment: updateComment,
  DeleteComment: deleteComment,
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
