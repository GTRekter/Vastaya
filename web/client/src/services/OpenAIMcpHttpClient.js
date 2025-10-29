import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";

export default class OpenAIMCPHttpClient {
  constructor(config = {}) {
    const {
      name = "mcp-client",
      version = "1.0.0",
      openaiClient,
      openaiOptions,
      model = "gpt-4.1-mini",
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
    if (openaiClient) {
      console.log("Using provided OpenAI client instance.");
      this.openai = openaiClient;
    } else {
      console.log("Creating new OpenAI client instance.");
      const clientOptions = {
        dangerouslyAllowBrowser: true,
        ...openaiOptions,
      };
      clientOptions.dangerouslyAllowBrowser = true;
      if (!clientOptions.apiKey) {
        throw new Error("OpenAI API key is required. Set REACT_APP_OPENAI_API_KEY in your environment or provide openaiOptions.apiKey.");
      }
      this.openai = new OpenAI(clientOptions);
    }
  }

  async connect(serverUrl, options = {}) {
    this.serverUrl = this.resolveUrl(serverUrl);
    await this.cleanup();
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
    await this.refreshTools();
  }

  async refreshTools() {
    this.assertConnected();
    const response = await this.client.request(
      { method: "tools/list" },
      ListToolsResultSchema
    );
    this.availableTools = response.tools ?? [];
    return this.availableTools;
  }

  async processQuery(query, options = {}) {
    this.assertConnected();

    const userMessage = {
      role: "user",
      content: query,
    };
    const messages = this.conversation.length > 0 ? [...this.conversation, userMessage] : [userMessage];
    this.conversation = messages;

    const tools = options.tools ?? this.availableTools ?? [];
    const openaiTools = tools.map((tool) => {
      const toolDefinition = {
        type: "function",
        function: {
          name: tool.name,
          parameters: tool.inputSchema ?? { type: "object", properties: {} },
        },
      };
      if (tool.description) {
        toolDefinition.function.description = tool.description;
      }
      return toolDefinition;
    });

    const finalText = [];

    while (true) {
      const response = await this.openai.chat.completions.create({
        model: options.model ?? this.model,
        max_tokens: options.maxTokens ?? this.maxTokens,
        messages: this.conversation,
        tools: openaiTools.length ? openaiTools : undefined,
        tool_choice: openaiTools.length ? "auto" : undefined,
      });

      const assistantMessage = response?.choices?.[0]?.message;
      if (!assistantMessage) {
        break;
      }

      if (assistantMessage.content) {
        if (Array.isArray(assistantMessage.content)) {
          finalText.push(
            assistantMessage.content
              .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
              .join("\n")
          );
        } else {
          finalText.push(assistantMessage.content);
        }
      }

      this.conversation.push(assistantMessage);

      const toolCalls = assistantMessage.tool_calls ?? [];
      if (!toolCalls.length) {
        break;
      }

      for (const toolCall of toolCalls) {
        const argsRaw = toolCall?.function?.arguments ?? "{}";
        let parsedArguments;
        try {
          parsedArguments = JSON.parse(argsRaw);
        } catch (error) {
          parsedArguments = {};
          console.warn(`Failed to parse tool arguments for ${toolCall?.function?.name}:`, error);
        }

        const result = await this.client.request(
          {
            method: "tools/call",
            params: {
              name: toolCall?.function?.name ?? toolCall?.id,
              arguments: parsedArguments,
            },
          },
          CallToolResultSchema
        );

        const toolName = toolCall?.function?.name ?? toolCall?.id ?? "unknown_tool";
        finalText.push(
          `[Calling tool ${toolName} with args ${JSON.stringify(
            parsedArguments
          )}]`
        );

        const isError =
          result?.isError ?? result?.is_error ?? Boolean(result?.error);
        const normalisedContent = this.normaliseToolResultContent(result?.content);
        this.conversation.push({
          role: "tool",
          tool_call_id: toolCall?.id,
          name: toolName,
          content: isError ? `Error: ${normalisedContent}` : normalisedContent,
        });
      }
    }

    return finalText.join("\n");
  }

  async cleanup() {
    if (this.transport) {
      if (typeof this.transport.terminateSession === "function") {
        try {
          await this.transport.terminateSession();
        } catch (error) {
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

  assertConnected() {
    if (!this.client || !this.transport) {
      throw new Error("Client not connected");
    }
  }

  normaliseToolResultContent(content) {
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") {
            return part;
          }
          if (part && typeof part === "object" && typeof part.text === "string") {
            return part.text;
          }
          return JSON.stringify(part ?? "");
        })
        .join("\n");
    }
    if (typeof content === "string") {
      return content;
    }
    if (content && typeof content === "object") {
      return JSON.stringify(content);
    }
    return "";
  }
}
