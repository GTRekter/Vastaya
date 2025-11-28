import { useCallback, useRef } from "react";
import { useMcp } from "use-mcp/react";

const defaultArgumentBuilder = (query, conversation) => ({
  message: query,
  query,
  input: query,
  conversation,
});

const normaliseToolResultContent = (content) => {
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
};

export default function useMcpService(options = {}) {
  const {
    url,
    defaultToolName = "get_universe_state",
    defaultArguments = defaultArgumentBuilder,
    debug = true,
  } = options;

  const { state, tools = [], callTool, clearStorage, logs } = useMcp({
    url,
    debug,
  });
  const conversationRef = useRef([]);

  const resolveToolName = useCallback(
    (requestedTool) => {
      const desiredTool = requestedTool ?? defaultToolName;
      if (!desiredTool) {
        return null;
      }
      const hasDesired = tools.some((tool) => tool?.name === desiredTool);
      if (hasDesired) {
        return desiredTool;
      }
      return tools[0]?.name ?? null;
    },
    [tools, defaultToolName]
  );

  const processQuery = useCallback(
    async (query, options = {}) => {
      if (!query || !query.trim()) {
        throw new Error("A query message is required.");
      }
      if (state !== "ready") {
        throw new Error(`MCP connection is not ready (state: ${state}).`);
      }

      const toolName = resolveToolName(options.toolName);
      if (!toolName) {
        throw new Error("No MCP tool available from the connected server.");
      }

      const toolInfo = tools.find((tool) => tool?.name === toolName) || {};
      const hasSchema =
        toolInfo?.inputSchema &&
        typeof toolInfo.inputSchema === "object" &&
        Object.keys(toolInfo.inputSchema?.properties || {}).length > 0;

      let toolArguments = options.arguments;
      if (toolArguments === undefined) {
        if (hasSchema) {
          toolArguments =
            typeof defaultArguments === "function"
              ? defaultArguments(query, conversationRef.current)
              : {
                  message: query,
                  query,
                  input: query,
                  conversation: conversationRef.current,
                };
        } else {
          toolArguments = {};
        }
      }

      const userMessage = { role: "user", content: query };
      conversationRef.current = [...conversationRef.current, userMessage];

      const callResponse =
        typeof callTool === "function" && callTool.length >= 2
          ? await callTool(toolName, toolArguments)
          : await callTool({ name: toolName, arguments: toolArguments });

      const text = normaliseToolResultContent(
        callResponse?.content ?? callResponse?.data ?? callResponse
      );
      const isError =
        callResponse?.isError ??
        callResponse?.is_error ??
        Boolean(callResponse?.error);

      const assistantMessage = {
        role: "assistant",
        content: isError ? `Error: ${text}` : text,
      };
      conversationRef.current = [...conversationRef.current, assistantMessage];
      return assistantMessage;
    },
    [state, resolveToolName, defaultArguments, callTool, tools]
  );

  const resetConversation = useCallback(() => {
    conversationRef.current = [];
  }, []);

  return {
    state,
    tools,
    processQuery,
    resetConversation,
    clearStorage,
    logs,
    callTool,
    normaliseToolResultContent,
  };
}
