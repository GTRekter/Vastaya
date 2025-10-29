import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";

const server = new McpServer({
  name: "weather",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

server.tool(
  "get_alerts",
  "Get weather alerts for a state",
  {
    state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY)"),
  },
  async ({ state }) => {
    const stateCode = state.toUpperCase();
    const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
    const alertsData = await makeNWSRequest(alertsUrl);

    if (!alertsData) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to retrieve alerts data",
          },
        ],
      };
    }

    const features = alertsData.features ?? [];
    if (features.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No active alerts for ${stateCode}`,
          },
        ],
      };
    }

    const formattedAlerts = features.map(formatAlert);
    const alertsText = `Active alerts for ${stateCode}:\n\n${formattedAlerts.join("\n")}`;

    return {
      content: [
        {
          type: "text",
          text: alertsText,
        },
      ],
    };
  },
);

async function makeNWSRequest(url) {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/geo+json",
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error making NWS request:", error);
    return null;
  }
}

function formatAlert(feature) {
  const props = feature?.properties ?? {};
  return [
    `Event: ${props.event ?? "Unknown"}`,
    `Area: ${props.areaDesc ?? "Unknown"}`,
    `Severity: ${props.severity ?? "Unknown"}`,
    `Status: ${props.status ?? "Unknown"}`,
    `Headline: ${props.headline ?? "No headline"}`,
    "---",
  ].join("\n");
}

server.tool(
  "get_forecast",
  "Get weather forecast for a location",
  {
    latitude: z.number().min(-90).max(90).describe("Latitude of the location"),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .describe("Longitude of the location"),
  },
  async ({ latitude, longitude }) => {
    const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const pointsData = await makeNWSRequest(pointsUrl);

    if (!pointsData) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to retrieve grid point data for coordinates: ${latitude}, ${longitude}. This location may not be supported by the NWS API (only US locations are supported).`,
          },
        ],
      };
    }

    const forecastUrl = pointsData?.properties?.forecast;
    if (!forecastUrl) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to get forecast URL from grid point data",
          },
        ],
      };
    }

    const forecastData = await makeNWSRequest(forecastUrl);
    if (!forecastData) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to retrieve forecast data",
          },
        ],
      };
    }

    const periods = forecastData?.properties?.periods ?? [];
    if (periods.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No forecast periods available",
          },
        ],
      };
    }

    const formattedForecast = periods.map((period) =>
      [
        `${period?.name ?? "Unknown"}:`,
        `Temperature: ${period?.temperature ?? "Unknown"}°${period?.temperatureUnit ?? "F"}`,
        `Wind: ${period?.windSpeed ?? "Unknown"} ${period?.windDirection ?? ""}`,
        `${period?.shortForecast ?? "No forecast available"}`,
        "---",
      ].join("\n"),
    );

    const forecastText = `Forecast for ${latitude}, ${longitude}:\n\n${formattedForecast.join("\n")}`;

    return {
      content: [
        {
          type: "text",
          text: forecastText,
        },
      ],
    };
  },
);

async function main() {
  const port = Number(process.env.MCP_HTTP_PORT ?? process.env.PORT ?? 3001);
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

      const requestUrl = new URL(req.url, `http://${req.headers.host ?? `localhost:${port}`}`);

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
    console.error(`Weather MCP Server running on http://localhost:${port}${endpoint}`);
  });

  const shutdown = () => {
    httpServer.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
