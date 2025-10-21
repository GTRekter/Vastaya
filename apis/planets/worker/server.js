require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const {
  TrafficManager,
  ValidationError,
  ensureError,
  waitFor,
} = require('./trafficManager');

const PLANET_ID = process.env.PLANET_ID || 'unknown-planet';
const PLANET_NAME = process.env.PLANET_NAME || PLANET_ID;
const GALAXY_ID = process.env.GALAXY_ID || 'unknown-galaxy';
const HTTP_PORT = Number.parseInt(process.env.HTTP_PORT || '8080', 10);
const GRPC_PORT = Number.parseInt(process.env.GRPC_PORT || '50051', 10);
const RESPONSE_DELAY_MS = Math.max(
  0,
  Number.parseInt(
    process.env.PLANET_RESPONSE_DELAY_MS ||
      process.env.RESPONSE_DELAY_MS ||
      '0',
    10
  ) || 0
);

const PROTO_PATH = path.join(__dirname, 'planet_worker.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const planetWorkerProto = protoDescriptor.planetworker;

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

function respondWithDelay(res, statusCode, payload) {
  if (res.headersSent) {
    return Promise.resolve();
  }

  if (RESPONSE_DELAY_MS > 0) {
    return waitFor(RESPONSE_DELAY_MS).then(() => {
      if (!res.headersSent) {
        res.status(statusCode).json(payload);
      }
    });
  }

  res.status(statusCode).json(payload);
  return Promise.resolve();
}

function normalizeHeaders(input) {
  if (!input || typeof input !== 'object') {
    return {};
  }

  return Object.entries(input).reduce((acc, [key, value]) => {
    if (typeof key !== 'string' || key.trim().length === 0) {
      return acc;
    }
    acc[key] =
      value === undefined || value === null ? '' : String(value).trim();
    return acc;
  }, {});
}

async function executeSend({ payload, headers, delayMs, target }) {
  const headersObject = normalizeHeaders(headers);
  const requestDelay = Number.isFinite(delayMs) ? Math.max(delayMs, 0) : 0;
  const totalDelay = RESPONSE_DELAY_MS + requestDelay;

  if (totalDelay > 0) {
    await waitFor(totalDelay);
  }

  const processedAt = new Date().toISOString();

  console.log(
    `[Planet ${PLANET_ID}] queued send request` +
      (target ? ` targeting "${target}"` : '') +
      ` with ${Object.keys(headersObject).length} custom header(s) and delay ${totalDelay}ms`
  );

  const response = {
    acknowledged: true,
    planetId: PLANET_ID,
    planetName: PLANET_NAME,
    galaxyId: GALAXY_ID,
    target: target || '',
    processedAt,
    payload:
      typeof payload === 'string' ? payload : JSON.stringify(payload ?? ''),
  };

  return { response, headers: headersObject };
}

const trafficManager = new TrafficManager({
  createGrpcClient: (target) =>
    new planetWorkerProto.PlanetWorker(
      target,
      grpc.credentials.createInsecure()
    ),
  logger: console,
});

app.get('/healthz', async (_req, res) => {
  const trafficStatus = trafficManager.status();
  await respondWithDelay(res, 200, {
    status: 'ok',
    planetId: PLANET_ID,
    planetName: PLANET_NAME,
    galaxyId: GALAXY_ID,
    responseDelayMs: RESPONSE_DELAY_MS,
    trafficActive: trafficStatus.active,
  });
});

app.post('/send', async (req, res) => {
  try {
    const status = await trafficManager.start(req.body);
    await respondWithDelay(res, 202, {
      message: 'Traffic generation started',
      traffic: status,
    });
  } catch (err) {
    const error = ensureError(err);
    const statusCode = error instanceof ValidationError ? 400 : 500;
    console.error('Failed to start traffic generator:', error);
    await respondWithDelay(res, statusCode, {
      message: error.message || 'Failed to start traffic generator',
    });
  }
});

app.post('/stop', async (_req, res) => {
  try {
    const wasActive = trafficManager.status().active;
    const status = await trafficManager.stop();
    await respondWithDelay(res, 200, {
      message: wasActive
        ? 'Traffic generator stopped'
        : 'Traffic generator was not running',
      traffic: status,
    });
  } catch (err) {
    const error = ensureError(err);
    console.error('Failed to stop traffic generator:', error);
    await respondWithDelay(res, 500, {
      message: error.message || 'Failed to stop traffic generator',
    });
  }
});

app.get('/status', async (_req, res) => {
  await respondWithDelay(res, 200, trafficManager.status());
});

app.use((err, _req, res, _next) => {
  console.error('Unexpected error in planet worker HTTP server:', err);
  if (res.headersSent) {
    return;
  }
  respondWithDelay(res, 500, { message: 'Unexpected error' }).catch(
    (delayErr) => {
      console.error('Failed to send delayed error response:', delayErr);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Unexpected error' });
      }
    }
  );
});

const grpcServer = new grpc.Server();
grpcServer.addService(planetWorkerProto.PlanetWorker.service, {
  Send: (call, callback) => {
    const { payload, headers, delayMs, target } = call.request || {};
    executeSend({
      payload,
      headers,
      delayMs: Number(delayMs),
      target,
    })
      .then(({ response }) => {
        callback(null, response);
      })
      .catch((err) => {
        const error = ensureError(err);
        console.error('Failed to handle gRPC Send request:', error);
        callback({
          code: grpc.status.INTERNAL,
          message: error.message || 'Failed to process send request',
        });
      });
  },
});

app.listen(HTTP_PORT, () => {
  console.log(
    `Planet worker HTTP server listening on port ${HTTP_PORT} for planet "${PLANET_ID}"`
  );
});

grpcServer.bindAsync(
  `0.0.0.0:${GRPC_PORT}`,
  grpc.ServerCredentials.createInsecure(),
  (err) => {
    if (err) {
      console.error('Failed to start gRPC server:', err);
      process.exit(1);
    }
    grpcServer.start();
    console.log(
      `Planet worker gRPC server listening on port ${GRPC_PORT} for planet "${PLANET_ID}"`
    );
  }
);
