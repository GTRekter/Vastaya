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
   docker image remove vastaya-frontend  
   docker build -t vastaya-frontend:latest web
   docker build -t galaxies-api:latest    apis/galaxies
   ```

3. **Import the images into k3d**  
   Skip this step if you pushed the images to a registry that the cluster can reach.
   ```bash
   k3d image import -c vastaya \
     vastaya-frontend:latest \
     galaxies-api:latest
   ```

4. **Install the charts**  
   Helm will create the `vastaya` namespace automatically. The default image names in `values.yaml` match the tags built above.
   ```bash
   helm uninstall -n vastaya vastaya-frontend
   helm upgrade --install vastaya-frontend charts/frontend \
     --namespace vastaya --create-namespace

   helm uninstall -n vastaya galaxies-api
   helm upgrade --install galaxies-api charts/galaxies \
     --namespace vastaya
   ```

5. **Watch the rollout**
   ```bash
   kubectl get pods,svc -n vastaya
   ```
   Wait until every Pod is `Running`. In `k3d`, the `vastaya-frontend` Service may display `<pending>` for the `EXTERNAL-IP`; you can still reach the app through `http://localhost:8081` thanks to the load balancer port mapping. If you prefer to avoid the `<pending>` status, install the chart with `--set service.type=NodePort --set service.nodePort=30080` and access it via `http://localhost:30080`.

6. **Access the UI**  
   Open http://localhost:8081/ in a browser. The frontend proxies API calls to in-cluster services. Update the Helm values if your API endpoints differ.

## Chart Configuration Highlights

### `charts/frontend`
- `service.type`: Defaults to `LoadBalancer`; switch to `ClusterIP` for internal-only access.
- `service.nodePort`: Set this (and flip `service.type` to `NodePort`) to use a fixed port when running on local clusters like `k3d`.
- `env.*`: Override these URLs if the backing APIs use different DNS names or ports.
- `image.*`, `resources`, `replicaCount`, `affinity`, and other standard knobs follow Helm conventions.

### `charts/galaxies`
- Creates a dedicated ServiceAccount plus ClusterRole/ClusterRoleBinding so the service can manage Kubernetes namespaces. Disable RBAC creation with `--set rbac.create=false` if you prefer to supply your own permissions.
- `env.tasksApiUrl`: Optional gRPC endpoint for the tasks microservice; leave blank to disable cross-service calls.
- All other tunable values mirror the frontend chart (`image.*`, `resources`, `replicaCount`, etc.).

## Cleanup
```bash
helm uninstall vastaya-frontend galaxies-api -n vastaya
k3d cluster delete vastaya
```
