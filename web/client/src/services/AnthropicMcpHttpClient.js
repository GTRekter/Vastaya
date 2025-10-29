import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import Anthropic from "@anthropic-ai/sdk";

export default class AnthropicMCPHttpClient {
  constructor(config = {}) {
    const {
      name = "mcp-client",
      version = "1.0.0",
      anthropicClient,
      anthropicOptions,
      model = "claude-sonnet-4-20250514",
      maxTokens = 1000,
      sessionId,
    } = config;
    this.clientInfo = { name, version };
    this.model = model;
    this.maxTokens = maxTokens;
    this.sessionId = sessionId;
    this.client = null;
    this.transport = null;
    this.availableTools = [];
    this.serverUrl = "";
    this.conversation = [];
    if (anthropicClient) {
      console.log("Using provided Anthropic client instance.");
      this.anthropic = anthropicClient;
    } else {
      console.log("Creating new Anthropic client instance.");
      const clientOptions = {
        dangerouslyAllowBrowser: true,
        ...anthropicOptions,
      };
      clientOptions.dangerouslyAllowBrowser = true;
      if (!clientOptions.apiKey) {
        throw new Error("Anthropic API key is required. Set REACT_APP_ANTHROPIC_API_KEY in your environment or provide anthropicOptions.apiKey.");
      }
      this.anthropic = new Anthropic(clientOptions);
    }
  }

  // ================================================================
  // Connects to an MCP server using the streamable HTTP transport.
  // ================================================================
  async connect(serverUrl, options = {}) {  
    // Resolve the server URL
    this.serverUrl = this.resolveUrl(serverUrl);
    // Closes the transport and releases server-side resources.
    await this.cleanup();
    // Initialize new transport and client
    this.transport = new StreamableHTTPClientTransport(this.serverUrl, {
      sessionId: options.sessionId ?? this.sessionId,
      requestInit: options.requestInit,
      fetch: options.fetch,
      reconnectionOptions: options.reconnectionOptions,
    });
    this.client = new Client(this.clientInfo, {
      capabilities: {},
    });
    await this.client.connect(this.transport);
    // Get Tool list after connecting
    await this.refreshTools();
  }

  // ================================================================
  // Retrieves the current set of tools from the server.
  // ================================================================ 
  async refreshTools() {
    this.assertConnected();
    const response = await this.client.request(
      { method: "tools/list" },
      ListToolsResultSchema
    );
    this.availableTools = response.tools ?? [];
    return this.availableTools;
  }

  // ================================================================
  // Processes a user query by coordinating with Anthropic and the MCP server.
  // ================================================================
  async processQuery(query, options = {}) {
    this.assertConnected();

    const userMessage = {
      role: "user",
      content: query,
    };
    const messages = this.conversation.length > 0 ? [...this.conversation, userMessage] : [userMessage];
    this.conversation = messages;
    const tools = options.tools ?? this.availableTools ?? [];
    const anthropicTools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
    let response = await this.anthropic.messages.create({
      model: options.model ?? this.model,
      max_tokens: options.maxTokens ?? this.maxTokens,
      messages,
      tools: anthropicTools,
    });

    const finalText = [];
    while (true) {
      // Record assistant response for conversational context
      this.conversation.push({
        role: "assistant",
        content: response.content,
      });
      let usedTool = false;
      for (const content of response.content) {
        if (content.type === "text") {
          finalText.push(content.text);
        } else if (content.type === "tool_use") {
          usedTool = true;
          const result = await this.client.request(
            {
              method: "tools/call",
              params: {
                name: content.name,
                arguments: content.input,
              },
            },
            CallToolResultSchema
          );
          finalText.push(
            `[Calling tool ${content.name} with args ${JSON.stringify(
              content.input
            )}]`
          );
          const toolResultContent = Array.isArray(result?.content)
            ? result.content
            : [
                {
                  type: "text",
                  text:
                    typeof result?.content === "string"
                      ? result.content
                      : JSON.stringify(result?.content ?? ""),
                },
              ];
          this.conversation.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: content.id,
                content: toolResultContent,
                is_error:
                  result?.isError ?? result?.is_error ?? result?.error ?? false,
              },
            ],
          });
        }
      }
      if (!usedTool) {
        break;
      }
      response = await this.anthropic.messages.create({
        model: options.model ?? this.model,
        max_tokens: options.maxTokens ?? this.maxTokens,
        messages: this.conversation,
        tools: anthropicTools,
      });
    }
    return finalText.join("\n");
  }

  // ================================================================
  // Cleans up resources by closing the transport.
  // ================================================================
  async cleanup() {
    if (this.transport) {
      if (typeof this.transport.terminateSession === "function") {
        try {
          await this.transport.terminateSession();
        } catch (error) {
          // Session termination is optional; ignore unsupported errors.
          if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
            console.warn("Failed to terminate MCP session:", error);
          }
        }
      }
      await this.transport.close();
      this.transport = null;
    }
    this.client = null;
    this.conversation = [];
  }

  // ================================================================
  // Resolve the server URL
  // ================================================================
  resolveUrl(serverUrl) {
    if (serverUrl instanceof URL) {
      return serverUrl;
    } else if (typeof serverUrl !== "string") {
      throw new Error("Server URL must be a string or URL instance");
    } else if (/^https?:\/\//i.test(serverUrl)) {
      return new URL(serverUrl);
    } else if (typeof window !== "undefined" && window.location) {
      return new URL(serverUrl, window.location.origin);
    } else {
      throw new Error("Relative URLs are only supported in environments with window.location");
    }
  }
  
  // ================================================================
  // Ensures the client is connected before making requests.
  // ================================================================
  assertConnected() {
    if (!this.client || !this.transport) {
      throw new Error("Client not connected");
    }
  }
}
