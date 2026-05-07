import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "ctxnest",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Handler that lists available tools.
 * Exposes a single "hello-world" tool.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "hello-world",
        description: "A simple hello world tool",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The name to say hello to",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "stat",
        description: "Check the status of the server",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

/**
 * Handler for the tool calls.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "hello-world") {
    const name = String(request.params.arguments?.name || "World");
    return {
      content: [
        {
          type: "text",
          text: `Hello, ${name}! This is the ctxtest MCP server.`,
        },
      ],
    };
  }

  if (request.params.name === "stat") {
    return {
      content: [
        {
          type: "text",
          text: "running well",
        },
      ],
    };
  }

  throw new Error("Tool not found");
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ctxtest MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
