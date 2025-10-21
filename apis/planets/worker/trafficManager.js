const http2 = require('http2');
const grpc = require('@grpc/grpc-js');
const { fetch } = require('undici');

const MAX_REQUESTS_PER_SECOND = 10000;
const MAX_PAYLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

const { constants: http2Constants } = http2;

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

function ensureError(err) {
  if (err instanceof Error) {
    return err;
  }
  if (err && typeof err === 'object') {
    return new Error(JSON.stringify(err));
  }
  return new Error(String(err));
}

function toFiniteNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return Number.NaN;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const parsed = toFiniteNumber(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return Number.NaN;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function waitFor(ms, signal) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve();
  }

  if (!signal) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    function cleanup() {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
    }

    function onAbort() {
      cleanup();
      resolve();
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function createPayloadString(size) {
  const length = clamp(
    Number.isFinite(size) ? Math.max(Math.round(size), 0) : 0,
    0,
    MAX_PAYLOAD_SIZE_BYTES
  );
  if (length === 0) {
    return '';
  }

  const chunk = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const repeat = Math.ceil(length / chunk.length);
  return chunk.repeat(repeat).slice(0, length);
}

function parseProtocol(raw) {
  if (typeof raw !== 'string') {
    return 'http';
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'grpc') {
    return 'grpc';
  }
  if (normalized === 'http2' || normalized === 'h2' || normalized === 'http/2') {
    return 'http2';
  }
  if (normalized === 'http' || normalized === 'https') {
    return 'http';
  }
  return null;
}

function parseTrafficConfig(body) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Traffic configuration payload is required.');
  }

  const protocol = parseProtocol(body.protocol);
  if (!protocol) {
    throw new ValidationError(
      'Protocol must be one of "HTTP", "HTTP2", or "gRPC".'
    );
  }

  const rawTarget = typeof body.target === 'string' ? body.target.trim() : '';
  if (!rawTarget) {
    throw new ValidationError('Target endpoint is required.');
  }

  let target = rawTarget;
  let httpUrl = null;
  let http2Path = null;

  if (protocol === 'http' || protocol === 'http2') {
    try {
      httpUrl = new URL(rawTarget);
    } catch {
      throw new ValidationError(
        'Target endpoint must be a valid HTTP or HTTPS URL.'
      );
    }

    if (!['http:', 'https:'].includes(httpUrl.protocol)) {
      throw new ValidationError(
        'HTTP-based traffic requires target to start with http:// or https://'
      );
    }

    target = httpUrl.toString();
    http2Path = `${httpUrl.pathname || '/'}${httpUrl.search || ''}`;
  } else if (!rawTarget.includes(':')) {
    throw new ValidationError(
      'gRPC traffic requires a target in the form host:port.'
    );
  }

  const requestsPerSecondRaw = firstFiniteNumber(
    body.requestsPerSecond,
    body.rps
  );
  if (Number.isNaN(requestsPerSecondRaw) || requestsPerSecondRaw <= 0) {
    throw new ValidationError(
      'Requests per second must be a positive number.'
    );
  }

  const requestsPerSecond = clamp(
    requestsPerSecondRaw,
    0.001,
    MAX_REQUESTS_PER_SECOND
  );

  let concurrency = Math.floor(requestsPerSecond);
  if (concurrency < 1) {
    concurrency = 1;
  }
  concurrency = clamp(concurrency, 1, 250);

  const perWorkerRate = requestsPerSecond / concurrency;
  const intervalMs =
    perWorkerRate > 0 ? Math.max(1, 1000 / perWorkerRate) : 1000;

  const payloadSizeRaw = firstFiniteNumber(
    body.payloadSize,
    body.payloadBytes,
    body.payloadLength
  );
  const payloadSize = clamp(
    Number.isNaN(payloadSizeRaw) ? 0 : Math.round(payloadSizeRaw),
    0,
    MAX_PAYLOAD_SIZE_BYTES
  );

  let payloadString = payloadSize > 0 ? createPayloadString(payloadSize) : '';
  if (body.payload !== undefined && body.payload !== null) {
    if (typeof body.payload === 'string') {
      payloadString = body.payload;
    } else if (
      typeof body.payload === 'object' &&
      !Buffer.isBuffer(body.payload)
    ) {
      payloadString = JSON.stringify(body.payload);
    }
  }

  const headers = Object.entries(body.headers || {}).reduce(
    (acc, [key, value]) => {
      if (typeof key !== 'string' || key.trim().length === 0) {
        return acc;
      }
      acc[key] =
        value === undefined || value === null ? '' : String(value).trim();
      return acc;
    },
    {}
  );

  const requestTimeoutValue = toFiniteNumber(
    firstFiniteNumber(body.requestTimeoutMs, body.timeoutMs, body.timeout)
  );
  const requestTimeoutMs = clamp(
    Number.isNaN(requestTimeoutValue)
      ? DEFAULT_REQUEST_TIMEOUT_MS
      : Math.max(1000, Math.round(requestTimeoutValue)),
    1000,
    5 * 60 * 1000
  );

  let method = null;
  if (protocol === 'http' || protocol === 'http2') {
    const rawMethod =
      typeof body.method === 'string' ? body.method.trim().toUpperCase() : '';
    method = rawMethod || 'POST';
  }

  const allowInsecureHttp2 =
    protocol === 'http2' &&
    Boolean(
      body.allowInsecureHttp2 ||
        body.allowInsecure ||
        body.insecureHttp2 ||
        body.insecure
    );

  return {
    protocol,
    target,
    httpUrl,
    http2Path,
    allowInsecureHttp2,
    requestsPerSecond,
    concurrency,
    perWorkerRate,
    intervalMs,
    headers,
    method,
    payloadString,
    requestTimeoutMs,
  };
}

function formatConfig(config) {
  const payloadLength = config.payloadString
    ? Buffer.byteLength(config.payloadString, 'utf8')
    : 0;
  const payloadPreview =
    config.payloadString && config.payloadString.length > 0
      ? config.payloadString.length > 120
        ? `${config.payloadString.slice(0, 117)}...`
        : config.payloadString
      : '';

  return {
    protocol: config.protocol,
    target: config.target,
    method: config.method,
    requestsPerSecond: Number(config.requestsPerSecond.toFixed(3)),
    concurrency: config.concurrency,
    perWorkerRate: Number(config.perWorkerRate.toFixed(3)),
    intervalMs: Math.round(config.intervalMs),
    payloadLength,
    headers: config.headers,
    payloadPreview,
    requestTimeoutMs: config.requestTimeoutMs,
  };
}

function formatStats(stats) {
  return {
    runId: stats.runId,
    startedAt: stats.startedAt,
    completedAt: stats.completedAt ?? null,
    runningWorkers: stats.runningWorkers,
    totalAttempts: stats.totalAttempts,
    totalSuccess: stats.totalSuccess,
    totalErrors: stats.totalErrors,
    lastSuccessAt: stats.lastSuccessAt ?? null,
    lastError: stats.lastError ?? null,
  };
}

function createHttp2Context(config, logger) {
  if (!config.httpUrl) {
    throw new Error('HTTP/2 configuration requires a parsed URL');
  }

  const authority = `${config.httpUrl.protocol}//${config.httpUrl.host}`;
  let session = null;

  function connect() {
    session = http2.connect(authority, {
      rejectUnauthorized:
        config.httpUrl.protocol === 'https:'
          ? !config.allowInsecureHttp2
          : undefined,
    });

    session.on('error', (err) => {
      logger.error(
        `[TrafficManager] HTTP/2 session error (${authority}):`,
        err
      );
    });

    session.on('close', () => {
      session = null;
    });
  }

  return {
    getSession() {
      if (!session || session.closed || session.destroyed) {
        connect();
      }
      return session;
    },
    close() {
      if (session && !session.destroyed) {
        try {
          session.close();
        } catch (err) {
          logger.error(
            `[TrafficManager] failed to close HTTP/2 session (${authority}):`,
            err
          );
        }
      }
      session = null;
    },
  };
}

function buildHttp2Headers(config) {
  const headers = {};

  Object.entries(config.headers).forEach(([key, value]) => {
    const lower = key.toLowerCase();
    if (
      ['connection', 'host', 'keep-alive', 'transfer-encoding', 'upgrade'].includes(
        lower
      )
    ) {
      return;
    }
    headers[lower] = value;
  });

  if (
    config.payloadString &&
    !headers['content-type'] &&
    config.method !== 'GET' &&
    config.method !== 'HEAD'
  ) {
    headers['content-type'] = 'application/octet-stream';
  }

  return {
    ':method': config.method || 'POST',
    ':path': config.http2Path || '/',
    ...headers,
  };
}

async function sendHttpRequest(config, signal) {
  const method = config.method || 'POST';
  const headers = { ...config.headers };

  if (
    config.payloadString &&
    !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type') &&
    method !== 'GET' &&
    method !== 'HEAD'
  ) {
    headers['content-type'] = 'application/octet-stream';
  }

  const controller = new AbortController();
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, config.requestTimeoutMs);

  const propagateAbort = () => {
    controller.abort();
  };

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeout);
      const abortError = new Error('Traffic generator aborted');
      abortError.name = 'AbortError';
      throw abortError;
    }
    signal.addEventListener('abort', propagateAbort, { once: true });
  }

  try {
    const response = await fetch(config.target, {
      method,
      headers,
      body:
        method === 'GET' || method === 'HEAD'
          ? undefined
          : config.payloadString,
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      const snippet =
        text.length > 200 ? `${text.slice(0, 197)}...` : text || '';
      const message = snippet
        ? `HTTP ${response.status} ${response.statusText || ''} :: ${snippet}`
        : `HTTP ${response.status} ${response.statusText || ''}`;
      throw new Error(message.trim());
    }

    return text;
  } catch (err) {
    const error = ensureError(err);
    if (error.name === 'AbortError' && didTimeout) {
      const timeoutError = new Error(
        `HTTP request timed out after ${config.requestTimeoutMs}ms`
      );
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (signal) {
      signal.removeEventListener('abort', propagateAbort);
    }
  }
}

async function sendHttp2Request(config, http2Context, signal) {
  const session = http2Context.getSession();
  if (!session) {
    throw new Error('Unable to establish HTTP/2 session');
  }

  const headers = buildHttp2Headers(config);

  return new Promise((resolve, reject) => {
    let statusCode = 0;
    const chunks = [];
    let didTimeout = false;
    let settled = false;

    const request = session.request(headers);

    const timeout = setTimeout(() => {
      didTimeout = true;
      try {
        request.close(http2Constants.NGHTTP2_CANCEL);
      } catch (err) {
        // ignore close errors when timing out
      }
    }, config.requestTimeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      if (signal) {
        signal.removeEventListener('abort', handleAbort);
      }
    }

    function handleAbort() {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      try {
        request.close(http2Constants.NGHTTP2_CANCEL);
      } catch (err) {
        // ignore abort errors
      }
      const abortError = new Error('Traffic generator aborted');
      abortError.name = 'AbortError';
      reject(abortError);
    }

    request.on('response', (responseHeaders) => {
      statusCode = responseHeaders[':status'] || 0;
    });

    request.on('data', (chunk) => {
      chunks.push(chunk);
    });

    request.on('end', () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      const body = Buffer.concat(chunks).toString('utf8');

      if (didTimeout) {
        const timeoutError = new Error(
          `HTTP/2 request timed out after ${config.requestTimeoutMs}ms`
        );
        timeoutError.name = 'TimeoutError';
        reject(timeoutError);
        return;
      }

      if (statusCode >= 200 && statusCode < 300) {
        resolve(body);
        return;
      }

      reject(
        new Error(
          `HTTP/2 ${statusCode || 'unknown'} :: ${
            body.length > 200 ? `${body.slice(0, 197)}...` : body
          }`
        )
      );
    });

    request.on('error', (err) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(ensureError(err));
    });

    if (signal) {
      if (signal.aborted) {
        handleAbort();
        return;
      }
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    if (
      config.payloadString &&
      config.method !== 'GET' &&
      config.method !== 'HEAD'
    ) {
      request.write(config.payloadString);
    }

    request.end();
  });
}

async function sendGrpcRequest(config, grpcClient, signal) {
  if (!grpcClient) {
    throw new Error('gRPC client is not initialized');
  }

  return new Promise((resolve, reject) => {
    const metadata = new grpc.Metadata();
    Object.entries(config.headers).forEach(([key, value]) => {
      metadata.set(key.toLowerCase(), value);
    });

    const request = {
      payload: config.payloadString,
      headers: config.headers,
      delayMs: 0,
      target: config.target,
    };

    const deadline = new Date(Date.now() + config.requestTimeoutMs);
    let settled = false;
    let call;

    function cleanup() {
      if (signal) {
        signal.removeEventListener('abort', handleAbort);
      }
    }

    function handleAbort() {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (call) {
        call.cancel();
      }
      const abortError = new Error('Traffic generator aborted');
      abortError.name = 'AbortError';
      reject(abortError);
    }

    call = grpcClient.Send(request, metadata, { deadline }, (err, response) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (err) {
        reject(ensureError(err));
      } else {
        resolve(response);
      }
    });

    if (signal) {
      if (signal.aborted) {
        handleAbort();
        return;
      }
      signal.addEventListener('abort', handleAbort, { once: true });
    }
  });
}

class TrafficManager {
  constructor({ createGrpcClient, logger }) {
    this.createGrpcClient = createGrpcClient;
    this.logger = logger || console;
    this.current = null;
    this.lastSnapshot = null;
    this.runCounter = 0;
  }

  status() {
    if (this.current) {
      return {
        active: true,
        config: formatConfig(this.current.config),
        stats: formatStats(this.current.stats),
      };
    }

    return {
      active: false,
      lastRun: this.lastSnapshot
        ? {
            config: this.lastSnapshot.config,
            stats: this.lastSnapshot.stats,
          }
        : null,
    };
  }

  async start(rawConfig) {
    const config = parseTrafficConfig(rawConfig);

    if (this.current) {
      await this.stop();
    }

    const runId = ++this.runCounter;
    const startedAt = new Date().toISOString();

    const stats = {
      runId,
      startedAt,
      completedAt: null,
      runningWorkers: config.concurrency,
      totalAttempts: 0,
      totalSuccess: 0,
      totalErrors: 0,
      lastSuccessAt: null,
      lastError: null,
    };

    const controllers = Array.from(
      { length: config.concurrency },
      () => new AbortController()
    );

    const grpcClient =
      config.protocol === 'grpc'
        ? this.createGrpcClient(config.target)
        : null;
    const http2Context =
      config.protocol === 'http2' ? createHttp2Context(config, this.logger) : null;

    const workerPromises = controllers.map((controller, index) =>
      this.runWorker({
        controller,
        index,
        config,
        stats,
        grpcClient,
        http2Context,
        runId,
      })
    );

    const stopPromise = Promise.allSettled(workerPromises).then(() => {
      stats.runningWorkers = 0;
      stats.completedAt = new Date().toISOString();

      if (grpcClient && typeof grpcClient.close === 'function') {
        try {
          grpcClient.close();
        } catch (err) {
          this.logger.error(
            `[TrafficManager] failed to close gRPC client:`,
            err
          );
        }
      }

      if (http2Context) {
        http2Context.close();
      }
    });

    this.current = {
      config,
      stats,
      controllers,
      stopPromise,
    };

    const protocolLabel =
      config.protocol === 'grpc'
        ? 'gRPC'
        : config.protocol === 'http2'
        ? 'HTTP/2'
        : 'HTTP';

    this.logger.info(
      `[TrafficManager] run ${runId} started targeting ${protocolLabel} ${config.target} @ ${config.requestsPerSecond.toFixed(
        3
      )} rps (concurrency ${config.concurrency})`
    );

    return this.status();
  }

  async stop() {
    if (!this.current) {
      return this.status();
    }

    const context = this.current;

    context.controllers.forEach((controller) => {
      controller.abort();
    });

    await context.stopPromise;

    const snapshot = {
      config: formatConfig(context.config),
      stats: formatStats(context.stats),
    };

    this.lastSnapshot = snapshot;
    this.current = null;

    this.logger.info(
      `[TrafficManager] run ${context.stats.runId} stopped`
    );

    return this.status();
  }

  async runWorker({
    controller,
    index,
    config,
    stats,
    grpcClient,
    http2Context,
    runId,
  }) {
    const signal = controller.signal;
    const workerLabel = `run ${runId} worker ${index + 1}/${config.concurrency}`;

    while (!signal.aborted) {
      const iterationStartedAt = Date.now();
      stats.totalAttempts += 1;

      try {
        if (config.protocol === 'http') {
          await sendHttpRequest(config, signal);
        } else if (config.protocol === 'http2') {
          await sendHttp2Request(config, http2Context, signal);
        } else {
          await sendGrpcRequest(config, grpcClient, signal);
        }

        stats.totalSuccess += 1;
        stats.lastSuccessAt = new Date().toISOString();
      } catch (err) {
        const error = ensureError(err);

        if (signal.aborted || error.name === 'AbortError') {
          break;
        }

        stats.totalErrors += 1;
        stats.lastError = {
          message: error.message,
          workerIndex: index,
          at: new Date().toISOString(),
        };

        this.logger.error(
          `[TrafficManager] traffic generator error (${workerLabel}):`,
          error
        );
      }

      if (signal.aborted) {
        break;
      }

      const elapsed = Date.now() - iterationStartedAt;
      const waitMs = Math.max(config.intervalMs - elapsed, 0);

      if (waitMs > 0) {
        await waitFor(waitMs, signal);
      }
    }

    stats.runningWorkers = Math.max(0, stats.runningWorkers - 1);
  }
}

module.exports = {
  TrafficManager,
  ValidationError,
  ensureError,
  waitFor,
};
