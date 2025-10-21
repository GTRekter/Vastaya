// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const k8s = require('@kubernetes/client-node');

const app = express();
app.use(express.json());
app.use(cors());

// Initialize Kubernetes client to manage namespaces per galaxy
const kubeConfig = new k8s.KubeConfig();
kubeConfig.loadFromDefault();
const coreV1Api = kubeConfig.makeApiClient(k8s.CoreV1Api);

const MANAGED_NAMESPACE_ANNOTATION = 'galaxies.vastaya.dev/managed';
const MANAGED_NAMESPACE_ANNOTATION_VALUE = 'true';

function getNamespaceStatus(namespace) {
  return namespace?.status?.phase
    ? namespace.status.phase.toLowerCase()
    : 'unknown';
}

function isManagedNamespace(namespace) {
  return (
    namespace?.metadata?.annotations?.[MANAGED_NAMESPACE_ANNOTATION] ===
    MANAGED_NAMESPACE_ANNOTATION_VALUE
  );
}

function isValidNamespaceName(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 63 &&
    /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name)
  );
}

async function ensureNamespace(namespaceName, annotations = {}) {
  const sanitizedAnnotations = Object.entries(annotations || {}).reduce(
    (acc, [key, value]) => {
      if (value !== undefined && value !== null) {
        acc[key] = value;
      }
      return acc;
    },
    {}
  );
  const desiredAnnotations = {
    ...sanitizedAnnotations,
    [MANAGED_NAMESPACE_ANNOTATION]: MANAGED_NAMESPACE_ANNOTATION_VALUE,
  };
  try {
    const response = await coreV1Api.createNamespace({
      metadata: {
        name: namespaceName,
        annotations: desiredAnnotations,
      },
    });
    return response.body;
  } catch (err) {
    if (err.response && err.response.statusCode === 409) {
      const existing = await coreV1Api.readNamespace(namespaceName);
      const existingAnnotations =
        existing.body?.metadata?.annotations ?? {};

      const needsPatch = Object.entries(desiredAnnotations).some(
        ([key, value]) => existingAnnotations[key] !== value
      );

      if (needsPatch) {
        await coreV1Api.patchNamespace(
          namespaceName,
          {
            metadata: {
              annotations: desiredAnnotations,
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

        const updated = await coreV1Api.readNamespace(namespaceName);
        return updated.body;
      }

      return existing.body;
    }
    throw err;
  }
}

async function readNamespace(namespaceName) {
  try {
    const response = await coreV1Api.readNamespace(namespaceName);
    return response.body;
  } catch (err) {
    if (err.response && err.response.statusCode === 403) {
      err.statusCode = 403;
      throw err;
    }
    if (err.response && err.response.statusCode === 404) {
      return null;
    }
    throw err;
  }
}

function namespaceToGalaxy(namespace) {
  return {
    id: namespace?.metadata?.name ?? '',
    name: namespace?.metadata?.name ?? '',
    status: getNamespaceStatus(namespace),
  };
}

app.get('/healthz', (_req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/readyz', async (_req, res) => {
  try {
    await coreV1Api.listNamespace(undefined, undefined, undefined, undefined, undefined, 1);
    res.json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', message: err.message });
  }
});

app.get('/galaxies', async (_req, res) => {
  try {
    const response = await coreV1Api.listNamespace();
    const managed = (response.body?.items ?? [])
      .filter((item) => isManagedNamespace(item))
      .map((item) => namespaceToGalaxy(item));
    res.json(managed);
  } catch (err) {
    console.error('Failed to list galaxies:', err);
    res.status(500).json({ message: err.message || 'Failed to list galaxies' });
  }
});

app.get('/galaxies/:id', async (req, res) => {
  const namespaceName = req.params.id;

  if (!isValidNamespaceName(namespaceName)) {
    return res
      .status(400)
      .json({ message: 'Galaxy name must be a valid Kubernetes namespace' });
  }

  try {
    const namespace = await readNamespace(namespaceName);

    if (!namespace || !isManagedNamespace(namespace)) {
      return res.status(404).json({ message: 'Galaxy not found' });
    }

    res.json(namespaceToGalaxy(namespace));
  } catch (err) {
    console.error('Failed to fetch galaxy:', err);
    const status = err.statusCode || err.response?.statusCode || 500;
    res.status(status).json({
      message:
        status === 403
          ? 'Galaxies API is not authorized to read namespaces. Ensure RBAC is configured.'
          : err.message || 'Failed to fetch galaxy',
    });
  }
});

app.post('/galaxies', async (req, res) => {
  const { name } = req.body ?? {};

  if (!name) {
    return res.status(400).json({ message: 'Galaxy name is required' });
  }

  if (!isValidNamespaceName(name)) {
    return res.status(400).json({
      message:
        'Galaxy name must be a valid Kubernetes namespace (lowercase alphanumeric and dashes)',
    });
  }

  try {
    const namespace = await ensureNamespace(name);
    res.status(201).json(namespaceToGalaxy(namespace));
  } catch (err) {
    console.error('Failed to create galaxy namespace:', err);

    const status = err.response?.statusCode === 403 ? 403 : 500;
    res
      .status(status)
      .json({ message: err.message || 'Failed to create namespace' });
  }
});

app.put('/galaxies/:id', async (req, res) => {
  const namespaceName = req.params.id;

  if (!isValidNamespaceName(namespaceName)) {
    return res.status(400).json({
      message:
        'Galaxy name must be a valid Kubernetes namespace (lowercase alphanumeric and dashes)',
    });
  }

  const { name } = req.body ?? {};

  if (name && name !== namespaceName) {
    return res.status(400).json({
      message:
        'Galaxy renaming is not supported. Delete and recreate the galaxy with the desired name.',
    });
  }

  try {
    const existing = await readNamespace(namespaceName);

    if (!existing || !isManagedNamespace(existing)) {
      return res.status(404).json({ message: 'Galaxy not found' });
    }

    res.json(namespaceToGalaxy(existing));
  } catch (err) {
    console.error('Failed to update galaxy:', err);
    res
      .status(500)
      .json({ message: err.message || 'Failed to reconcile namespace' });
  }
});

app.delete('/galaxies/:id', async (req, res) => {
  const namespaceName = req.params.id;

  if (!isValidNamespaceName(namespaceName)) {
    return res.status(400).json({
      message:
        'Galaxy name must be a valid Kubernetes namespace (lowercase alphanumeric and dashes)',
    });
  }

  try {
    const existing = await readNamespace(namespaceName);

    if (!existing || !isManagedNamespace(existing)) {
      return res.status(404).json({ message: 'Galaxy not found' });
    }

    await coreV1Api.deleteNamespace(namespaceName);
    res.status(204).send();
  } catch (err) {
    console.error('Failed to delete galaxy:', err);
    const status = err.statusCode || err.response?.statusCode || 500;
    res.status(status).json({
      message:
        status === 403
          ? 'Galaxies API is not authorized to delete namespaces. Ensure RBAC allows the delete verb.'
          : err.message || 'Failed to delete galaxy namespace',
    });
  }
});

const port = Number.parseInt(process.env.PORT || '8081', 10);

app.listen(port, () => {
  console.log(`Galaxies API listening on port ${port}`);
});
