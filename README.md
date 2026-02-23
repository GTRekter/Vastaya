# Vastaya

Vastaya is a Kubernetes-native demo platform that simulates an interplanetary trade network. A React UI lets you configure the universe (planet deployments, chaos settings, service mesh features), launch fleet missions (load-generation jobs between planets), and chat with an MCP-powered AI agent that can inspect and control the cluster.

![Screenshot of the Vastaya demo](assets/sample.png)

---

## Concepts

### The Universe

The Universe is the top-level configuration object that defines everything running in the cluster. It is a single JSON document managed by the Universe API (`servers/universe`) and edited through the **Universe Builder** tab in the UI. The document contains the list of planets to deploy, universe-wide feature flags (wormholes, shields, cross-galaxy networking mode), and chaos settings that are injected into each planet pod as environment variables.

Changes to the Universe are staged locally and do not take effect until you click **Apply**. When applied, the Universe API renders the configuration into Kubernetes Deployments and Services and sends them to the cluster via `kubectl apply`. Removing a planet from the list tears down its Deployment and Service.

On first boot the Universe API detects that no configuration has been applied and automatically deploys all four planets using the default settings, so missions can be launched straight away without a manual Apply.

### Planets

Each planet is a Kubernetes Deployment running the Spaceport runtime (`servers/spaceport`). The four planets represent archetypal distributed services with deliberately different traffic behaviours:

| Planet | Type | What it models |
|---|---|---|
| **Planet A** | Trade Hub | A high-throughput, stateless service. No artificial latency or failure injection — requests are processed as fast as the runtime allows. |
| **Planet B** | Archive World | A slow storage node. Nebula latency is enabled by default, adding hundreds of milliseconds to every response to simulate a database or object-store backend. |
| **Planet C** | Experimental Research | A flaky service. Chaos injection is enabled by default, causing a configurable fraction of incoming requests (18 % by default) to return HTTP 500, so you can observe error rates and retry behaviour. |
| **Planet D** | Resort Planet | A bursty, low-volume service that mimics a workload with sporadic traffic spikes rather than a steady baseline. |

When a planet pod starts it launches a background polling loop that calls `GET /api/fleet/orders?planetId=<id>` on the Fleet API every 5 seconds. The response is the set of currently actionable missions where this planet is the source. The pod reconciles that list with its running traffic streams: it starts a new stream for any mission that has appeared, restarts a stream whose parameters changed, and stops any stream whose mission is no longer actionable.

Chaos and nebula effects are applied as HTTP middleware to every non-health request the planet receives — including docking requests from other planets. This means that if Planet C is the destination, 18 % of each incoming burst of requests will fail with a 500, regardless of which planet sent them.

### Missions

A mission drives synthetic HTTP traffic from one planet (the source) to another (the destination) at a configured rate and speed profile.

#### Creating a mission

When you create a mission you specify:

- **Source / Destination** — any two planets in the universe (they can be the same planet).
- **RPS** — target requests per second the source should aim to emit toward the destination.
- **Speed** — controls how traffic is shaped into bursts:
  - `cruise` — steady, predictable flow. Burst size ≈ 1× RPS, cooldown ≈ 1 s. Produces a flat, uniform request rate.
  - `warp` — high-intensity bursts. Burst size 1.75–3× RPS, cooldown 1.2–2.4 s. Sends large simultaneous waves with longer pauses between them.
  - `chaotic` — unpredictable. Burst size 0.35–4× RPS, cooldown 0.35–1.5 s. Useful for generating spiky, noisy traffic.

The Fleet API assigns the mission a UUID, sets its `status` to `scheduled`, and persists it to disk (`fleet-state.json`). The mission record is returned immediately but no traffic flows yet.

Within 5 seconds the source planet's polling loop picks up the new mission from `/orders`. It starts an async load-streaming task that runs a continuous burst-and-cooldown loop: each iteration fires `burst_size` concurrent HTTP `POST /dock` requests to the destination planet, waits for the cooldown period, then repeats. Each docking request carries a randomly generated cargo manifest (2–4 line items chosen from a fixed catalogue: fusion cores, quantum relays, hydroponic seeds, and so on).

The destination planet receives each `POST /dock`, simulates 3–6 docking operations in sequence (requesting clearance, aligning cargo bay doors, signing the customs ledger, etc., each taking 0.2–1.5 s), and returns a response summarising what was processed. If nebula latency or chaos injection is enabled on the destination, those effects are applied to the docking requests before the handler runs.

#### Terminating a mission

Terminating a mission sets its `status` to `terminated` in the Fleet API's persisted state. Terminated missions are excluded from the `/orders` response — only missions with `status` `scheduled` or `running` are returned as actionable.

The next time the source planet's polling loop runs (within 5 seconds) it no longer sees the mission in its orders. The `sync_mission_streams` reconciliation detects that the mission ID has disappeared and signals the streaming task to stop by setting its stop event. The burst loop exits cleanly after the current in-flight requests complete. The mission record is retained in the Fleet API for reference but generates no further traffic.

### Errors between planets

The following errors can appear in the source planet's logs as `WARNING:spaceport:Mission <id> dispatch to <planet> failed: <message>`. They have different root causes and are not all equivalent.

#### Connection pool exhaustion — `"failed: "` (empty message)

This is the most common warning and always appears with a blank message after the colon. The spaceport creates one `httpx.AsyncClient` per active mission stream, and httpx defaults to a maximum of 100 simultaneous open connections per client. When a burst fires more concurrent requests than this limit, the excess requests queue waiting for a slot; if a slot does not free up before the timeout they fail with `httpx.PoolTimeout`, whose string representation is an empty string.

The burst size is determined by RPS × the speed profile's burst multiplier:

| Speed | Burst multiplier | RPS where pool starts failing |
|---|---|---|
| `cruise` | 0.95–1.05× | ≈ 100 RPS |
| `warp` | 1.75–3×  | ≈ 34–57 RPS |
| `chaotic` | 0.35–4×  | unpredictable; can fail at any RPS |

Pool exhaustion is made worse by slow destinations: if the destination planet has nebula latency enabled each connection stays open longer, preventing freed slots from becoming available fast enough. With nebula at 35 ms and docking simulation adding 0.6–9 s per request, connections can be held for several seconds, dramatically reducing throughput at any burst size above the pool limit.

#### Chaos-injection failures — `"failed: Client error '500 Internal Server Error'"`

When `chaosExperimentsEnabled` is on in the Universe Builder, every planet's HTTP middleware randomly returns a 500 response before the request handler runs. The default failure rate is 18 % (`CHAOS_FAILURE_RATE=0.18`). The source planet calls `response.raise_for_status()` on every docking response, so any 500 is caught and logged as a warning with the HTTP status in the message.

This error is independent of RPS and speed: even a single-request burst will see roughly 1 in 5 requests fail. At high RPS the raw count of failures scales linearly with burst size. Because chaos applies to all planets equally, a mission that routes through multiple hops accumulates failure probability at each hop.

#### Dispatch timeouts — `"failed: timed out"` or `"failed: Read timeout"`

The `httpx.AsyncClient` is constructed with a timeout equal to `MISSION_DISPATCH_TIMEOUT_SECONDS` (default 5 s). A request that does not complete within that window raises `httpx.ReadTimeout` or `httpx.ConnectTimeout`. This happens when:

- Nebula density is high enough that the added latency alone exceeds the timeout. At 35 ms the timeout is rarely hit; at 4 000 ms every request that also performs multi-step docking operations (0.2–1.5 s per step × 3–6 steps = 0.6–9 s) will breach the 5-second budget.
- The destination pod is overwhelmed by a large burst and its event loop is backlogged, causing response times to climb above the timeout.
- Pool exhaustion and nebula latency compound: requests queued waiting for a pool slot consume part of the timeout budget before the connection is even established, so the effective time available for the actual HTTP round-trip is `timeout − queue_wait_time`.

#### Connection errors — `"failed: Connect Error"` or similar

These appear when the TCP connection to the destination cannot be established at all: the pod is not running, is in CrashLoopBackOff, is being replaced during a rolling update, or has been deleted by the black hole chaos job (which randomly terminates planet pods when `blackHoleEnabled` is set). The error message contains the underlying OS or network reason.

#### Summary

| Symptom in logs | Root cause | Triggered by |
|---|---|---|
| `failed: ` (empty) | httpx pool exhausted | Burst size > 100; warp/chaotic at moderate RPS; slow destinations |
| `failed: Client error '500 ...'` | Chaos injection (18 % default) | `chaosExperimentsEnabled=true` in universe config |
| `failed: timed out` / `Read timeout` | Response time > 5 s | High nebula density; destination pod overwhelmed |
| `failed: Connect Error` | TCP connection refused | Pod restarting, not ready, or deleted by black hole |

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
