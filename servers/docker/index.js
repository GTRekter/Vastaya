import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  listContainers,
  listImages,
  getLogs,
  runContainer,
  stopContainer,
  removeContainer,
  removeImage,
  inspectResource,
  pruneDocker,
  composeCommand,
} from "./operations.js";

const server = new McpServer({
  name: "docker-mcp-http",
  version: "1.0.0",
  capabilities: {
    tools: {},
  },
});

function textResponse(text, isError = false) {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
    isError,
  };
}

function errorMessage(error) {
  if (!error) {
    return "Unknown Docker error.";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    const pieces = [error.message];
    if (error.stderr) {
      pieces.push(error.stderr);
    }
    return pieces.filter(Boolean).join("\n").trim();
  }
  return String(error);
}

server.tool(
  "docker_list_containers",
  "List Docker containers on the host system.",
  {
    all: z
      .boolean()
      .optional()
      .describe("Include stopped containers."),
    format: z
      .enum(["table", "json"])
      .optional()
      .describe("When set to json, returns one JSON object per line."),
  },
  async (params) => {
    try {
      const text = await listContainers(params);
      return textResponse(text);
    } catch (error) {
      return textResponse(errorMessage(error), true);
    }
  },
);

server.tool(
  "docker_list_images",
  "List Docker images present on the host.",
  {
    all: z
      .boolean()
      .optional()
      .describe("Include intermediate (dangling) images."),
    digests: z
      .boolean()
      .optional()
      .describe("Show image digests."),
  },
  async (params) => {
    try {
      const text = await listImages(params);
      return textResponse(text);
    } catch (error) {
      return textResponse(errorMessage(error), true);
    }
  },
);

server.tool(
  "docker_get_logs",
  "Fetch logs from a Docker container.",
  {
    containerId: z.string().describe("Container ID or name."),
    tail: z
      .number()
      .int()
      .optional()
      .describe("Number of lines to return from the end of the logs."),
    timestamps: z
      .boolean()
      .optional()
      .describe("Include timestamps in the output."),
    since: z
      .string()
      .optional()
      .describe("Only return logs since the given timestamp (RFC3339 or duration)."),
  },
  async (params) => {
    try {
      const text = await getLogs(params);
      return textResponse(text);
    } catch (error) {
      return textResponse(errorMessage(error), true);
    }
  },
);

server.tool(
  "docker_run_container",
  "Run a Docker container.",
  {
    image: z.string().describe("Docker image to run."),
    name: z
      .string()
      .optional()
      .describe("Optional container name."),
    command: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("Command to run inside the container."),
    detach: z
      .boolean()
      .optional()
      .describe("Run in the background (default true)."),
    remove: z
      .boolean()
      .optional()
      .describe("Automatically remove the container when it exits."),
    env: z
      .record(z.string())
      .optional()
      .describe("Environment variables map."),
    ports: z
      .array(z.string())
      .optional()
      .describe("Port mappings in host:container form."),
    volumes: z
      .array(z.string())
      .optional()
      .describe("Volume mappings in host:container form."),
    workdir: z
      .string()
      .optional()
      .describe("Working directory inside the container."),
    extraArgs: z
      .array(z.string())
      .optional()
      .describe("Additional docker arguments."),
  },
  async (params) => {
    try {
      const text = await runContainer(params);
      return textResponse(text);
    } catch (error) {
      return textResponse(errorMessage(error), true);
    }
  },
);

server.tool(
  "docker_stop_container",
  "Stop a running Docker container.",
  {
    containerId: z.string().describe("Container ID or name."),
  },
  async (params) => {
    try {
      const text = await stopContainer(params);
      return textResponse(text);
    } catch (error) {
      return textResponse(errorMessage(error), true);
    }
  },
);

server.tool(
  "docker_remove_container",
  "Remove a Docker container.",
  {
    containerId: z.string().describe("Container ID or name."),
    force: z
      .boolean()
      .optional()
      .describe("Force removal even if running."),
  },
  async (params) => {
    try {
      const text = await removeContainer(params);
      return textResponse(text);
    } catch (error) {
      return textResponse(errorMessage(error), true);
    }
  },
);

server.tool(
  "docker_remove_image",
  "Remove a Docker image by ID or repository tag.",
  {
    imageId: z.string().describe("Image ID or repository:tag to remove."),
    force: z
      .boolean()
      .optional()
      .describe("Force removal even if the image is in use."),
    prune: z
      .boolean()
      .optional()
      .describe("Also remove untagged parent images."),
  },
  async (params) => {
    try {
      const text = await removeImage(params);
      return textResponse(text);
    } catch (error) {
      return textResponse(errorMessage(error), true);
    }
  },
);

server.tool(
  "docker_inspect",
  "Run docker inspect on a target container, image, or other object.",
  {
    target: z.string().describe("Container, image, or other Docker resource."),
    format: z
      .string()
      .optional()
      .describe("Optional Go template format string."),
  },
  async (params) => {
    try {
      const text = await inspectResource(params);
      return textResponse(text);
    } catch (error) {
      return textResponse(errorMessage(error), true);
    }
  },
);

server.tool(
  "docker_prune",
  "Prune unused Docker resources.",
  {
    scope: z
      .enum(["system", "volume", "network", "container", "image"])
      .optional()
      .describe("Resource scope to prune. Defaults to system."),
    force: z
      .boolean()
      .optional()
      .describe("Skip confirmation prompt."),
  },
  async (params) => {
    try {
      const text = await pruneDocker(params);
      return textResponse(text);
    } catch (error) {
      return textResponse(errorMessage(error), true);
    }
  },
);

server.tool(
  "docker_compose",
  "Execute a docker compose subcommand.",
  {
    subcommand: z.string().describe("Subcommand to run (up, down, ps, logs, etc.)."),
    args: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("Additional arguments passed to docker compose."),
    file: z
      .string()
      .optional()
      .describe("Compose file path."),
    project: z
      .string()
      .optional()
      .describe("Compose project name."),
  },
  async (params) => {
    try {
      const text = await composeCommand(params);
      return textResponse(text);
    } catch (error) {
      return textResponse(errorMessage(error), true);
    }
  },
);

async function main() {
  const port = Number(process.env.MCP_HTTP_PORT ?? process.env.PORT ?? 3002);
  const endpoint = process.env.MCP_HTTP_PATH ?? "/mcp";
  const allowedOrigin = process.env.MCP_HTTP_ALLOW_ORIGIN ?? "*";

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    try {
      if (!req.url) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Bad Request" }));
        return;
      }

      const requestUrl = new URL(
        req.url,
        `http://${req.headers.host ?? `localhost:${port}`}`,
      );

      if (requestUrl.pathname !== endpoint) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not Found" }));
        return;
      }

      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, MCP-Session-Id, MCP-Protocol-Version, mcp-session-id, mcp-protocol-version",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Expose-Headers", "MCP-Session-Id, mcp-session-id");

      if (req.method === "OPTIONS") {
        res.writeHead(204).end();
        return;
      }

      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Failed to handle MCP request:", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
      }
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
  });

  httpServer.listen(port, () => {
    console.error(`Docker MCP Server listening on http://localhost:${port}${endpoint}`);
  });

  const shutdown = () => {
    httpServer.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Fatal error while starting Docker MCP server:", error);
  process.exit(1);
});
