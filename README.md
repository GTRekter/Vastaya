# Vastaya Deployment Guide

This document describes how to deploy the Vastaya React frontend and the Galaxies gRPC API into a local `k3d` Kubernetes cluster using the included Helm charts. The frontend is published through a LoadBalancer, while the Galaxies API remains internal and is accessed through Kubernetes DNS.

## Prerequisites
- Docker
- `k3d` (v5.0+)
- `kubectl`
- `helm` (v3.0+)
- This repository checked out locally

## Deploy With Helm

> Replace `vastaya` with a different name if you already use that cluster name.

1. **Create the cluster**
   ```bash
   k3d cluster delete vastaya
   k3d cluster create vastaya \
     --servers 1 \
     --agents 2 \
     --port 8081:80@loadbalancer \
     --k3s-arg "--disable=traefik@server:0"
   ```

2. **Build the container images**  
   Run these commands from the repository root so the Docker contexts resolve correctly. If you publish images to a registry instead, adjust the Helm values accordingly.
   ```bash
   docker image remove galaxies-api
   docker image remove planets-api
   docker image remove planet-worker
   docker image remove vastaya-frontend
   docker build -t vastaya-frontend:latest web
   docker build -t galaxies-api:latest    apis/galaxies/server
   docker build -t planets-api:latest     apis/planets/server
   docker build -t planet-worker:latest   apis/planets/worker
   ```

   > The planet worker is a Node.js 20 service that pulls in gRPC (`@grpc/grpc-js`,
   > `@grpc/proto-loader`) and HTTP tooling (`express`, `undici`, `cors`, `dotenv`).
   > Docker installs these automatically, but if you plan to run it locally remember to
   > run `npm install` inside `apis/planets/worker` before starting the service.

3. **Import the images into k3d**  
   Skip this step if you pushed the images to a registry that the cluster can reach.
   ```bash
   k3d image import -c vastaya \
     vastaya-frontend:latest \
     galaxies-api:latest \
     planets-api:latest \
     planet-worker:latest
   ```

   > The Planets API reads the `PLANET_WORKER_IMAGE` environment variable (defaulting to `planet-worker:latest`) when provisioning per-planet workloads. Update it if you push the worker image to a registry.

4. **Install the chart**  
   Helm will create the `vastaya` namespace automatically. The combined chart deploys the frontend and galaxies API with static object names (`deployment-frontend`, `deployment-galaxies-api`, and their companion Services/RBAC).
   ```bash
   helm uninstall -n vastaya vastaya
   helm upgrade --install vastaya charts/vastaya \
     --namespace vastaya --create-namespace
   ```

5. **Watch the rollout**
   ```bash
   kubectl get pods,svc -n vastaya
   ```
   Wait until every Pod is `Running`. In `k3d`, the `vastaya-frontend` Service may display `<pending>` for the `EXTERNAL-IP`; you can still reach the app through `http://localhost:8081` thanks to the load balancer port mapping. If you prefer to avoid the `<pending>` status, install the chart with `--set frontend.service.type=NodePort --set frontend.service.nodePort=30080` and access it via `http://localhost:30080`. The Planets API and sample worker are exposed via `planets-svc` and `planet-worker-svc`.

6. **Access the UI**  
   Open http://localhost:8081/ in a browser. The frontend proxies API calls to in-cluster services. Update the Helm values if your API endpoints differ.

## Chart Configuration Highlights

### `charts/vastaya`
- **frontend.service.type**: Defaults to `LoadBalancer`; switch to `ClusterIP` for internal-only access or use `NodePort` for fixed ports on local clusters.
- **frontend.env.\***: Override these URLs if the backing APIs use different DNS names or ports.
- **galaxies.serviceAccount.create / galaxies.rbac.create**: Control whether the chart provisions the namespaces management permissions automatically.
- **galaxies.env.tasksApiUrl**: Optional gRPC endpoint for the tasks microservice; leave blank to disable cross-service calls.
- **planets.serviceAccount.create / planets.rbac.create**: Grant the Planets API the ability to manage planet ConfigMaps, Services, and Deployments across namespaces.
- **planets.env.workerImage / workerHttpPort / workerGrpcPort**: Configure the default worker image and ports that the Planets API provisions for each planet.
- **planetWorker.enabled**: Deploy a demo worker instance (with configurable env values) that you can target immediately.
- **frontend.\***, **galaxies.\***, **planets.\***, and **planetWorker.\*** share standard Helm knobs (`image.*`, `resources`, `replicaCount`, `affinity`, etc.) for fine-grained tuning.

## Cleanup
```bash
helm uninstall vastaya -n vastaya
k3d cluster delete vastaya
```
