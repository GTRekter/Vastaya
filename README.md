# MCP Demo Workspace

This repository bundles a small collection of Model Context Protocol (MCP) tooling:

- A React client (`web/client`) that can talk to MCP servers through either OpenAI or Anthropic chat completions.
- A static Node/Express wrapper (`web/server`) for serving the production build of the client.
- An HTTP-based Weather MCP server implemented in JavaScript (`servers/weather`).
- An HTTP-based Prometheus metrics MCP server implemented in JavaScript (`servers/prometheus`).
- A Docker management MCP server implemented in JavaScript (`servers/docker`).

Use the web client to experiment with running either server (or any MCP endpoint you already have) and switch between model providers at runtime.

---

## Repository Layout

```
web/
  client/    React SPA that calls MCP servers via Anthropic or OpenAI
  server/    Express server that serves the built client
servers/
  weather/   Sample MCP server that surfaces National Weather Service data
  prometheus/ Prometheus metrics MCP server
  docker/    Docker management MCP server (see its README for details)
```

---

## Prerequisites

- Node.js 18+ and npm (for the React client and JavaScript MCP servers)
- Python 3.11+ (if you plan to run the Docker MCP server)
- Docker (optional; required only if you want the Docker MCP server to manage local containers)
- API keys:
  - `REACT_APP_ANTHROPIC_API_KEY` for Anthropic (optional if you only use OpenAI)
  - `REACT_APP_OPENAI_API_KEY` for OpenAI (optional if you only use Anthropic)

---

## Getting Started

### 1. Configure Environment Variables

Copy `.env.example` from `web/client` if available, or create `web/client/.env.local` with the keys you need:

```ini
REACT_APP_MCP_SERVER_URL=http://localhost:3001/mcp
REACT_APP_ANTHROPIC_API_KEY=your-anthropic-key
REACT_APP_OPENAI_API_KEY=your-openai-key
```

If you want to avoid checking keys into version control, place them in `.env.local`. The React app reads both `.env` and `.env.local`.

### 2. Install Client Dependencies

```bash
cd web/client
npm install
```

### 3. Run the React Dev Server

```bash
npm start
```

The app runs on `http://localhost:3000` and proxies MCP requests to the URL specified by `REACT_APP_MCP_SERVER_URL`. Use the provider dropdown in the footer to switch between Anthropic and OpenAI models.

---

## Sample MCP Servers

### Weather MCP Server (JavaScript)

```bash
cd servers/weather
npm install     # installs dependencies (already done once in this repo)
npm start
```

By default the server listens on `http://localhost:3001/mcp`, which matches the default `REACT_APP_MCP_SERVER_URL`. It exposes two tools:

- `get_alerts` – weather alerts by US state code
- `get_forecast` – forecast by latitude/longitude

### Docker MCP Server (HTTP)

```bash
cd servers/docker
npm install
npm start
```

The Docker server mirrors the weather server’s HTTP layout. It listens on `http://localhost:3002/mcp` by default and exposes tools for listing images/containers, fetching logs, running or stopping containers, pruning resources, and executing `docker compose` subcommands. Point `REACT_APP_MCP_SERVER_URL` at this endpoint if you want the web client to target Docker instead of the weather sample.

Make sure the Docker daemon is running locally and that your user has permission to access it (on Linux, add yourself to the `docker` group and restart your shell session).

### Prometheus MCP Server (HTTP)

```bash
cd servers/prometheus
npm install
PROMETHEUS_URL=http://localhost:9090 npm start
```

The Prometheus server shares the Docker server’s HTTP transport. It listens on `http://localhost:3003/mcp` by default and expects `PROMETHEUS_URL` (plus any optional auth environment variables) to point at a running Prometheus instance. Use `MCP_HTTP_PORT`, `MCP_HTTP_PATH`, or `MCP_HTTP_ALLOW_ORIGIN` if you need to customise the HTTP endpoint.

Example MCP client entry:

```json
{
  "mcpServers": {
    "prometheus": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/Repositories/MCP/servers/prometheus/index.js"
      ],
      "env": {
        "MCP_HTTP_PORT": "3003",
        "PROMETHEUS_URL": "http://localhost:9090"
      }
    }
  }
}
```

---

## Building the Client for Production

```bash
cd web/client
npm run build
```

The static assets end up in `web/client/build`. Serve them locally with:

```bash
cd web/server
npm install
npm start            # serves the ./build directory on port 80 by default
```

You can also containerize the app with `web/Dockerfile`.

---

## Tips

- You can run multiple MCP servers simultaneously; point the web client at whichever HTTP endpoint you want to explore by updating `REACT_APP_MCP_SERVER_URL`.
- The client keeps a per-session conversation history; use the refresh button to clear state and force a new MCP session.
- When switching model providers, the app cleans up the existing MCP connection to avoid tool-call mixups.

---

## License

See individual project folders for license details (`servers/docker` ships with its own license file). Unless noted otherwise, code in this repository is licensed under the included terms.
