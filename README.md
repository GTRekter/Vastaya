# Vastaya

Vastaya is a Kubernetes-native demo platform that simulates an interplanetary trade network. A React UI lets you configure the universe (planet deployments, chaos settings, service mesh features), launch fleet missions (load-generation jobs between planets), and chat with an MCP-powered AI agent that can inspect and control the cluster.

![Screenshot of the Vastaya demo](assets/sample.png)

---

## Quick start (k3d)

### 1. Create the cluster

```bash
k3d cluster create vastaya --agents 1 --port "8080:80@loadbalancer"
```

### 2. Build and import all images

```bash
docker build -t vastaya-web:local           ./web
docker build -t vastaya-spaceport:local     ./servers/spaceport
docker build -t vastaya-fleet:local         ./servers/fleet
docker build -t vastaya-universe:local      ./servers/universe
docker build -t vastaya-mcp:local           ./servers/mcp
docker build -t vastaya-control-tower:local ./servers/control-tower

k3d image import --cluster vastaya \
  vastaya-web:local \
  vastaya-spaceport:local \
  vastaya-fleet:local \
  vastaya-universe:local \
  vastaya-mcp:local \
  vastaya-control-tower:local
```

> **Important:** k3d runs containerd inside Docker containers — its image store is isolated from the host Docker daemon. You must run `k3d image import` every time you rebuild a service image, then restart the affected deployment (`kubectl rollout restart deployment/<name> -n vastaya`).

### 3. Deploy with Helm

```bash
helm upgrade --install vastaya ./helm/vastaya \
  --namespace vastaya \
  --create-namespace \
  --set web.image.repository=vastaya-web \
  --set web.image.tag=local \
  --set universe.image.repository=vastaya-universe \
  --set universe.image.tag=local \
  --set fleet.image.repository=vastaya-fleet \
  --set fleet.image.tag=local \
  --set spaceport.image.repository=vastaya-spaceport \
  --set spaceport.image.tag=local \
  --set mcp.image.repository=vastaya-mcp \
  --set mcp.image.tag=local \
  --set controlTower.image.repository=vastaya-control-tower \
  --set controlTower.image.tag=local \
  --set controlTower.googleApiKey=<YOUR-GOOGLE-API-KEY> \
  --set mcp.googleApiKey=<YOUR-GOOGLE-API-KEY> \
  --set web.ingress.enabled=true \
  --set 'web.ingress.hosts[0].host=localhost' \
  --set 'web.ingress.hosts[0].paths[0].path=/' \
  --set 'web.ingress.hosts[0].paths[0].pathType=Prefix'
```

Open **http://localhost:8080** (k3d load balancer) or port-forward directly:

```bash
kubectl -n vastaya port-forward svc/vastaya-web 8080:80
```

### 4. Universe auto-bootstrap

On first boot the Universe API detects that no configuration has been applied and automatically deploys all four planets (`planet-a` through `planet-d`) using `vastaya-spaceport:local` as the planet image. You can launch fleet missions immediately — no manual "Apply" step needed.

If you want to customize the universe (enable chaos, wormholes, nebula, etc.) use the **Universe Builder** tab in the UI and click **Apply**.

---

## Rebuilding a single service

```bash
# Example: rebuild the fleet service after a code change
docker build -t vastaya-fleet:local ./servers/fleet
k3d image import vastaya-fleet:local -c vastaya
kubectl rollout restart deployment/vastaya-fleet -n vastaya
```

Repeat the same three steps for any other service (`vastaya-universe`, `vastaya-spaceport`, `vastaya-web`, etc.).

---

## Local development (without k3d)

### React front-end (`web/client`)

Requires Universe, Fleet, Control Tower, and MCP services running locally. API URLs are configured in `web/client/.env`.

```bash
cd web/client
yarn install
yarn start
```

Visit http://localhost:3000.

### Universe configuration API (`servers/universe`)

```bash
cd servers/universe
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 4005
```

The API is available at `http://localhost:4005/api/universe`. Without a live cluster set `UNIVERSE_APPLY_MODE=dry-run` — `/apply` will return the rendered manifest YAML without calling the Kubernetes API.

### Fleet mission service (`servers/fleet`)

```bash
cd servers/fleet
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 4006
```

Create a mission:

```bash
curl -X POST http://localhost:4006/api/fleet/missions \
  -H 'Content-Type: application/json' \
  -d '{"source":{"id":"planet-a"},"destination":{"id":"planet-b"},"rps":100,"speed":"cruise","escortEnabled":true}'
```

Planet pods poll `GET /api/fleet/orders?planetId=<id>` to retrieve actionable missions and begin issuing traffic toward the destination.

### Spaceport runtime (`servers/spaceport`)

The spaceport is the application that runs inside each planet pod. It polls the Fleet API for orders and dispatches HTTP traffic to destination planets.

```bash
cd servers/spaceport
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export PLANET_ID=planet-a
export FLEET_API_BASE_URL=http://localhost:4006/api/fleet
export NEBULA_ENABLED=true
export NEBULA_DENSITY=125
export CHAOS_EXPERIMENTS_ENABLED=true
uvicorn app:app --reload --port 8080
```

Key environment variables:

| Variable | Default | Description |
|---|---|---|
| `PLANET_ID` | _(none)_ | Identifier for this planet; enables mission polling |
| `FLEET_API_BASE_URL` | `http://localhost:4006/api/fleet` | Fleet API endpoint (injected automatically by the Universe API in-cluster) |
| `NEBULA_ENABLED` | `false` | Add artificial latency to all non-health requests |
| `NEBULA_DENSITY` | `0` | Latency in milliseconds when nebula is enabled |
| `CHAOS_EXPERIMENTS_ENABLED` | `false` | Randomly return HTTP 500 responses |
| `CHAOS_FAILURE_RATE` | `0.18` | Fraction of requests that fail when chaos is enabled |

Hit `http://localhost:8080/status` for the combined config + fleet snapshot, or `/missions` to proxy the Fleet API.

Run as a container locally:

```bash
docker run --rm -p 8080:8080 \
  -e PLANET_ID=planet-a \
  -e FLEET_API_BASE_URL=http://host.docker.internal:4006/api/fleet \
  -e PLANET_SERVICE_TEMPLATE=http://host.docker.internal:8080 \
  vastaya-spaceport:local
```

### Control Tower (`servers/control-tower`)

Translates chat requests from the React UI to the configured LLM (Google Gemini by default) and routes tool calls through the MCP server.

```bash
cd servers/control-tower
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in your GOOGLE_API_KEY
uvicorn app:app --port 3100
```

### MCP agent (`servers/mcp`)

Hosts the FastMCP server and Google ADK agents (fleet and universe). Listens on port 3002 by default.

```bash
cd servers/mcp
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp fleet_agent/.env.example fleet_agent/.env
cp universe_agent/.env.example universe_agent/.env
python3 server.py
```

To exercise the agents with the Google ADK web harness:

```bash
cd servers/mcp
source fleet_agent/.env
adk web
```

Try queries like "List the current missions", "Create a mission from planet-a to planet-b at 200 RPS", or "Destroy all planets".

The MCP server exposes a `vastaya://planets` resource returning the live planet list from the Universe API. Local MCP-aware clients (e.g. Claude Desktop) can auto-register via `.mcp/servers.json`.

---

## Architecture & service dependencies

### Service map

```
Browser
  │
  │  HTTP (port 8080 via k3d load balancer)
  ▼
Ingress (Traefik)
  ├── /              → vastaya-web          :80    React SPA + Express
  ├── /api/universe  → vastaya-universe     :4005  Universe config API
  ├── /api/fleet     → vastaya-fleet        :4006  Fleet mission API
  ├── /api/spaceport → vastaya-spaceport    :8080  Spaceport runtime
  ├── /mcp           → vastaya-mcp          :3002  MCP agent server
  └── /chat          → vastaya-control-tower:3100  LLM gateway
```

### Call graph

```
React UI
  ├── GET/POST /api/universe  ──────────────────────────► Universe API
  ├── GET/POST /api/fleet     ──────────────────────────► Fleet API
  └── POST     /chat          ──► Control Tower
                                      │ sync / streaming
                                      ▼
                                  MCP Server
                                  ├── universe_agent ──► Universe API
                                  └── fleet_agent    ──► Fleet API

Universe API
  └── kubectl apply (Kubernetes API) ──► Planet Deployments / Services

Planet pods (Spaceport)
  ├── polls GET /api/fleet/orders  ──► Fleet API   (async, every 5 s)
  └── POST  /dock                  ──► other planet pods
```

### Coupling table

| Caller | Callee | Style | Timeout | Fails if callee is down? |
|---|---|---|---|---|
| Control Tower | MCP Server | sync / streaming | none | yes — chat unavailable |
| MCP Server | Universe API | sync | 10 s | yes — universe tools fail |
| MCP Server | Fleet API | sync | 10 s | yes — fleet tools fail |
| Spaceport | Fleet API | async polling | 5 s | no — logs warning, retries |
| Spaceport | Other planets | async burst | 5 s | no — per-burst failure logged |

**Universe API** and **Fleet API** are fully self-contained — they make no outbound calls and can run independently of every other service.

---

## License

Refer to the individual directories for licensing terms.
