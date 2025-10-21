// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const k8s = require('@kubernetes/client-node');

const app = express();
app.use(express.json());
app.use(cors());

// Initialize Kubernetes clients
const kubeConfig = new k8s.KubeConfig();
kubeConfig.loadFromDefault();
const coreV1Api = kubeConfig.makeApiClient(k8s.CoreV1Api);
const appsV1Api = kubeConfig.makeApiClient(k8s.AppsV1Api);

const MANAGED_NAMESPACE_ANNOTATION = 'galaxies.vastaya.dev/managed';
const MANAGED_NAMESPACE_VALUE = 'true';
const MANAGED_PLANET_LABEL = 'planets.vastaya.dev/managed';
const PLANET_ID_LABEL = 'planets.vastaya.dev/planet-id';
const DISPLAY_NAME_ANNOTATION = 'planets.vastaya.dev/display-name';
const STATUS_KEY = 'status';
const REPLICAS_KEY = 'replicas';
const RESPONSE_DELAY_KEY = 'responseDelayMs';
const SPACEPORT_STATUS_KEY = 'spaceportStatus';
const DEFAULT_STATUS = 'open';
const DEFAULT_RESPONSE_DELAY_MS = 0;
const MAX_RESPONSE_DELAY_MS = 5 * 60 * 1000;
const DEFAULT_SPACEPORT_STATUS = 'active';

const PLANET_WORKER_IMAGE =
  process.env.PLANET_WORKER_IMAGE || 'planet-worker:latest';
const PLANET_HTTP_PORT = Number.parseInt(
  process.env.PLANET_HTTP_PORT || '8080',
  10
);
const PLANET_GRPC_PORT = Number.parseInt(
  process.env.PLANET_GRPC_PORT || '50051',
  10
);
const PLANET_SERVICE_SUFFIX = 'svc';
const PLANET_CONTAINER_NAME = 'planet-worker';
const MIN_REPLICAS = 1;
const MAX_REPLICAS = Number.isNaN(
  Number.parseInt(process.env.PLANET_MAX_REPLICAS || '50', 10)
)
  ? 50
  : Number.parseInt(process.env.PLANET_MAX_REPLICAS || '50', 10);

function isValidNamespaceName(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 63 &&
    /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name)
  );
}

async function readNamespace(namespaceName) {
  try {
    const response = await coreV1Api.readNamespace(namespaceName);
    return response.body;
  } catch (err) {
    if (err.response && err.response.statusCode === 404) {
      return null;
    }
    throw err;
  }
}

function isManagedGalaxyNamespace(namespace) {
  return (
    namespace?.metadata?.annotations?.[MANAGED_NAMESPACE_ANNOTATION] ===
    MANAGED_NAMESPACE_VALUE
  );
}

function slugifyPlanetName(name) {
  const base = (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (base.length === 0) {
    return 'planet';
  }
  return base.slice(0, 50);
}

async function ensureUniquePlanetName(namespace, baseName) {
  let candidate = baseName || 'planet';
  let counter = 1;

  while (true) {
    try {
      await coreV1Api.readNamespacedConfigMap(candidate, namespace);
      counter += 1;
      candidate = `${baseName}-${counter}`;
    } catch (err) {
      if (err.response && err.response.statusCode === 404) {
        return candidate;
      }
      throw err;
    }
  }
}

function planetSelectorLabels(resourceName) {
  return {
    'app.kubernetes.io/name': PLANET_CONTAINER_NAME,
    [PLANET_ID_LABEL]: resourceName,
  };
}

function planetLabels(resourceName) {
  return {
    ...planetSelectorLabels(resourceName),
    'app.kubernetes.io/part-of': 'vastaya-planets',
    [MANAGED_PLANET_LABEL]: 'true',
  };
}

function sanitizeReplicas(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return MIN_REPLICAS;
  }
  return Math.min(Math.max(parsed, MIN_REPLICAS), MAX_REPLICAS);
}

function sanitizeResponseDelay(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return DEFAULT_RESPONSE_DELAY_MS;
  }
  return Math.min(parsed, MAX_RESPONSE_DELAY_MS);
}

function configMapToPlanet(configMap) {
  const annotations = configMap?.metadata?.annotations ?? {};
  const data = configMap?.data ?? {};
  const rawReplicas = sanitizeReplicas(data[REPLICAS_KEY] ?? MIN_REPLICAS);
  const responseDelayMs = sanitizeResponseDelay(
    data[RESPONSE_DELAY_KEY] ?? DEFAULT_RESPONSE_DELAY_MS
  );
  const resourceName = configMap?.metadata?.name ?? '';
  const serviceName = resourceName
    ? `${resourceName}-${PLANET_SERVICE_SUFFIX}`
    : '';
  const spaceportStatusRaw =
    (data[SPACEPORT_STATUS_KEY] ?? DEFAULT_SPACEPORT_STATUS).toString();
  const spaceportStatus =
    spaceportStatusRaw.trim().length > 0
      ? spaceportStatusRaw.trim()
      : DEFAULT_SPACEPORT_STATUS;

  return {
    id: resourceName,
    name: annotations[DISPLAY_NAME_ANNOTATION] ?? resourceName,
    status: data[STATUS_KEY] ?? DEFAULT_STATUS,
    replicas: rawReplicas,
    galaxyId: configMap?.metadata?.namespace ?? '',
    serviceName,
    httpPort: PLANET_HTTP_PORT,
    grpcPort: PLANET_GRPC_PORT,
    responseDelayMs,
    spaceportStatus,
  };
}

async function ensurePlanetConfigMap(
  galaxyId,
  resourceName,
  displayName,
  status,
  replicas,
  responseDelayMs,
  spaceportStatus
) {
  const manifest = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: resourceName,
      labels: planetLabels(resourceName),
      annotations: {
        [DISPLAY_NAME_ANNOTATION]: displayName,
      },
    },
    data: {
      [STATUS_KEY]: status,
      [REPLICAS_KEY]: String(replicas),
      [RESPONSE_DELAY_KEY]: String(responseDelayMs),
      [SPACEPORT_STATUS_KEY]: spaceportStatus,
    },
  };

  try {
    await coreV1Api.createNamespacedConfigMap(galaxyId, manifest);
  } catch (err) {
    if (err.response && err.response.statusCode === 409) {
      await coreV1Api.patchNamespacedConfigMap(
        resourceName,
        galaxyId,
        manifest,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          headers: { 'Content-Type': 'application/merge-patch+json' },
        }
      );
    } else {
      throw err;
    }
  }
}

async function ensurePlanetDeployment(
  galaxyId,
  resourceName,
  displayName,
  replicas,
  responseDelayMs
) {
  const selector = planetSelectorLabels(resourceName);
  const labels = planetLabels(resourceName);
  const manifest = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: resourceName,
      labels,
    },
    spec: {
      replicas,
      selector: { matchLabels: selector },
      template: {
        metadata: {
          labels,
        },
        spec: {
          containers: [
            {
              name: PLANET_CONTAINER_NAME,
              image: PLANET_WORKER_IMAGE,
              imagePullPolicy: 'IfNotPresent',
              ports: [
                { name: 'http', containerPort: PLANET_HTTP_PORT },
                { name: 'grpc', containerPort: PLANET_GRPC_PORT },
              ],
              env: [
                { name: 'PLANET_ID', value: resourceName },
                { name: 'PLANET_NAME', value: displayName },
                { name: 'GALAXY_ID', value: galaxyId },
                { name: 'HTTP_PORT', value: String(PLANET_HTTP_PORT) },
                { name: 'GRPC_PORT', value: String(PLANET_GRPC_PORT) },
                {
                  name: 'PLANET_RESPONSE_DELAY_MS',
                  value: String(responseDelayMs),
                },
              ],
            },
          ],
        },
      },
    },
  };

  try {
    await appsV1Api.createNamespacedDeployment(galaxyId, manifest);
  } catch (err) {
    if (err.response && err.response.statusCode === 409) {
      await appsV1Api.patchNamespacedDeployment(
        resourceName,
        galaxyId,
        {
          metadata: { labels },
          spec: {
            replicas,
            selector: { matchLabels: selector },
            template: manifest.spec.template,
          },
        },
        undefined,
        undefined,
        undefined,
        undefined,
        {
          headers: { 'Content-Type': 'application/merge-patch+json' },
        }
      );
    } else {
      throw err;
    }
  }
}

async function ensurePlanetService(galaxyId, resourceName) {
  const selector = planetSelectorLabels(resourceName);
  const labels = planetLabels(resourceName);
  const serviceName = `${resourceName}-${PLANET_SERVICE_SUFFIX}`;

  const manifest = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: serviceName,
      labels,
    },
    spec: {
      type: 'ClusterIP',
      selector,
      ports: [
        {
          name: 'http',
          port: PLANET_HTTP_PORT,
          targetPort: PLANET_HTTP_PORT,
        },
        {
          name: 'grpc',
          port: PLANET_GRPC_PORT,
          targetPort: PLANET_GRPC_PORT,
        },
      ],
    },
  };

  try {
    await coreV1Api.createNamespacedService(galaxyId, manifest);
  } catch (err) {
    if (err.response && err.response.statusCode === 409) {
      await coreV1Api.patchNamespacedService(
        serviceName,
        galaxyId,
        manifest,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          headers: { 'Content-Type': 'application/merge-patch+json' },
        }
      );
    } else {
      throw err;
    }
  }
}

async function deletePlanetResources(galaxyId, planetId) {
  try {
    await coreV1Api.deleteNamespacedConfigMap(planetId, galaxyId);
  } catch (err) {
    if (!(err.response && err.response.statusCode === 404)) {
      throw err;
    }
  }

  try {
    await appsV1Api.deleteNamespacedDeployment(planetId, galaxyId);
  } catch (err) {
    if (!(err.response && err.response.statusCode === 404)) {
      throw err;
    }
  }

  const serviceName = `${planetId}-${PLANET_SERVICE_SUFFIX}`;
  try {
    await coreV1Api.deleteNamespacedService(serviceName, galaxyId);
  } catch (err) {
    if (!(err.response && err.response.statusCode === 404)) {
      throw err;
    }
  }
}

async function listManagedGalaxyNamespaces() {
  const response = await coreV1Api.listNamespace();
  return (response.body?.items ?? []).filter((item) =>
    isManagedGalaxyNamespace(item)
  );
}

async function readPlanetConfigMap(galaxyId, planetId) {
  try {
    const response = await coreV1Api.readNamespacedConfigMap(
      planetId,
      galaxyId
    );
    const isManaged =
      response.body?.metadata?.labels?.[MANAGED_PLANET_LABEL] === 'true';
    if (!isManaged) {
      return null;
    }
    return response.body;
  } catch (err) {
    if (err.response && err.response.statusCode === 404) {
      return null;
    }
    throw err;
  }
}

async function listPlanetsForGalaxy(galaxyId) {
  const response = await coreV1Api.listNamespacedConfigMap(
    galaxyId,
    undefined,
    undefined,
    undefined,
    undefined,
    `${MANAGED_PLANET_LABEL}=true`
  );
  const items = response.body?.items ?? [];
  return items.map((item) => configMapToPlanet(item));
}

async function ensurePlanetWorkload({
  galaxyId,
  resourceName,
  displayName,
  status,
  replicas,
  responseDelayMs,
  spaceportStatus,
}) {
  await ensurePlanetConfigMap(
    galaxyId,
    resourceName,
    displayName,
    status,
    replicas,
    responseDelayMs,
    spaceportStatus
  );
  await ensurePlanetDeployment(
    galaxyId,
    resourceName,
    displayName,
    replicas,
    responseDelayMs
  );
  await ensurePlanetService(galaxyId, resourceName);
}

async function createPlanet(galaxyId, planetInput) {
  const displayName = (planetInput.name ?? '').trim();
  if (!displayName) {
    const error = new Error('Planet name is required');
    error.statusCode = 400;
    throw error;
  }

  const baseName = slugifyPlanetName(displayName);
  const resourceName = await ensureUniquePlanetName(galaxyId, baseName);
  const status =
    (planetInput.status ?? DEFAULT_STATUS).trim() || DEFAULT_STATUS;
  const replicas = sanitizeReplicas(planetInput.replicas ?? MIN_REPLICAS);
  const responseDelayMs = sanitizeResponseDelay(
    planetInput.responseDelayMs ?? DEFAULT_RESPONSE_DELAY_MS
  );
  const spaceportStatus = DEFAULT_SPACEPORT_STATUS;

  await ensurePlanetWorkload({
    galaxyId,
    resourceName,
    displayName,
    status,
    replicas,
    responseDelayMs,
    spaceportStatus,
  });

  const configMap = await readPlanetConfigMap(galaxyId, resourceName);
  return configMapToPlanet(configMap);
}

app.get('/healthz', (_req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/readyz', async (_req, res) => {
  try {
    await coreV1Api.listNamespace(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      1
    );
    res.json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', message: err.message });
  }
});

app.get('/planets', async (_req, res) => {
  try {
    const namespaces = await listManagedGalaxyNamespaces();
    const planets = await Promise.all(
      namespaces.map(async (namespace) => {
        const namespaceName = namespace?.metadata?.name;
        if (!namespaceName) {
          return [];
        }
        return listPlanetsForGalaxy(namespaceName);
      })
    );
    res.json(planets.flat());
  } catch (err) {
    console.error('Failed to list planets:', err);
    res.status(500).json({ message: err.message || 'Failed to list planets' });
  }
});

app.get('/planets/galaxies/:galaxyId', async (req, res) => {
  const { galaxyId } = req.params;

  if (!isValidNamespaceName(galaxyId)) {
    return res.status(400).json({
      message:
        'Galaxy name must be a valid Kubernetes namespace (lowercase alphanumeric and dashes)',
    });
  }

  const namespace = await readNamespace(galaxyId);
  if (!namespace || !isManagedGalaxyNamespace(namespace)) {
    return res.status(404).json({ message: 'Galaxy not found' });
  }

  try {
    const planets = await listPlanetsForGalaxy(galaxyId);
    res.json(planets);
  } catch (err) {
    console.error('Failed to list planets for galaxy:', err);
    res.status(500).json({
      message: err.message || 'Failed to list planets for the galaxy',
    });
  }
});

app.post('/planets/galaxies/:galaxyId', async (req, res) => {
  const { galaxyId } = req.params;
  const { name, status, replicas, responseDelayMs } = req.body ?? {};

  if (!isValidNamespaceName(galaxyId)) {
    return res.status(400).json({
      message:
        'Galaxy name must be a valid Kubernetes namespace (lowercase alphanumeric and dashes)',
    });
  }

  const namespace = await readNamespace(galaxyId);
  if (!namespace || !isManagedGalaxyNamespace(namespace)) {
    return res.status(404).json({ message: 'Galaxy not found' });
  }

  try {
    const planet = await createPlanet(galaxyId, {
      name,
      status,
      replicas,
      responseDelayMs,
    });
    res.status(201).json(planet);
  } catch (err) {
    console.error('Failed to create planet:', err);
    const statusCode = err.statusCode || err.response?.statusCode || 500;
    res.status(statusCode).json({
      message: err.message || 'Failed to create planet',
    });
  }
});

app.get('/planets/galaxies/:galaxyId/:planetId', async (req, res) => {
  const { galaxyId, planetId } = req.params;

  if (!isValidNamespaceName(galaxyId)) {
    return res.status(400).json({
      message:
        'Galaxy name must be a valid Kubernetes namespace (lowercase alphanumeric and dashes)',
    });
  }

  try {
    const namespace = await readNamespace(galaxyId);

    if (!namespace || !isManagedGalaxyNamespace(namespace)) {
      return res.status(404).json({ message: 'Galaxy not found' });
    }

    const configMap = await readPlanetConfigMap(galaxyId, planetId);
    if (!configMap) {
      return res.status(404).json({ message: 'Planet not found' });
    }

    res.json(configMapToPlanet(configMap));
  } catch (err) {
    console.error('Failed to fetch planet:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch planet' });
  }
});

app.put('/planets/galaxies/:galaxyId/:planetId/status', async (req, res) => {
  const { galaxyId, planetId } = req.params;
  const { status } = req.body ?? {};

  if (!isValidNamespaceName(galaxyId)) {
    return res.status(400).json({
      message:
        'Galaxy name must be a valid Kubernetes namespace (lowercase alphanumeric and dashes)',
    });
  }

  if (typeof status !== 'string' || status.trim().length === 0) {
    return res
      .status(400)
      .json({ message: 'Planet status must be a non-empty string' });
  }

  try {
    const namespace = await readNamespace(galaxyId);

    if (!namespace || !isManagedGalaxyNamespace(namespace)) {
      return res.status(404).json({ message: 'Galaxy not found' });
    }

    const configMap = await readPlanetConfigMap(galaxyId, planetId);
    if (!configMap) {
      return res.status(404).json({ message: 'Planet not found' });
    }

    const sanitizedStatus = status.trim();
    const replicas = sanitizeReplicas(
      configMap?.data?.[REPLICAS_KEY] ?? MIN_REPLICAS
    );
    const responseDelayMs = sanitizeResponseDelay(
      configMap?.data?.[RESPONSE_DELAY_KEY] ?? DEFAULT_RESPONSE_DELAY_MS
    );
    const spaceportStatusRaw =
      (configMap?.data?.[SPACEPORT_STATUS_KEY] ?? DEFAULT_SPACEPORT_STATUS).toString();
    const spaceportStatus =
      spaceportStatusRaw.trim().length > 0
        ? spaceportStatusRaw.trim()
        : DEFAULT_SPACEPORT_STATUS;
    const displayName =
      configMap?.metadata?.annotations?.[DISPLAY_NAME_ANNOTATION] ??
      configMap?.metadata?.name ??
      planetId;

    await ensurePlanetWorkload({
      galaxyId,
      resourceName: planetId,
      displayName,
      status: sanitizedStatus,
      replicas,
      responseDelayMs,
      spaceportStatus,
    });

    const updated = await readPlanetConfigMap(galaxyId, planetId);
    res.json(configMapToPlanet(updated));
  } catch (err) {
    console.error('Failed to update planet status:', err);
    res
      .status(500)
      .json({ message: err.message || 'Failed to update planet status' });
  }
});

app.delete('/planets/galaxies/:galaxyId/:planetId', async (req, res) => {
  const { galaxyId, planetId } = req.params;

  if (!isValidNamespaceName(galaxyId)) {
    return res.status(400).json({
      message:
        'Galaxy name must be a valid Kubernetes namespace (lowercase alphanumeric and dashes)',
    });
  }

  try {
    const namespace = await readNamespace(galaxyId);

    if (!namespace || !isManagedGalaxyNamespace(namespace)) {
      return res.status(404).json({ message: 'Galaxy not found' });
    }

    const configMap = await readPlanetConfigMap(galaxyId, planetId);
    if (!configMap) {
      return res.status(404).json({ message: 'Planet not found' });
    }

    await deletePlanetResources(galaxyId, planetId);
    res.status(204).send();
  } catch (err) {
    console.error('Failed to delete planet:', err);
    const statusCode = err.statusCode || err.response?.statusCode || 500;
    res
      .status(statusCode)
      .json({ message: err.message || 'Failed to delete planet' });
  }
});

const port = Number.parseInt(process.env.PORT || '8082', 10);

app.listen(port, () => {
  console.log(`Planets API listening on port ${port}`);
});
