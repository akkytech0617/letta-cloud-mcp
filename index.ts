#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import LettaClient from "@letta-ai/letta-client";
import { z } from "zod";

// Zod schemas for input validation
const ListAgentsSchema = z.object({
  limit: z.number().optional(),
});

const GetAgentSchema = z.object({
  agent_id: z.string().optional(),
});

const SendMessageSchema = z.object({
  agent_id: z.string().optional(),
  message: z.string({ error: "message is required" }),
});

const ListMemoryBlocksSchema = z.object({
  agent_id: z.string().optional(),
});

const GetMemoryBlockSchema = z.object({
  agent_id: z.string().optional(),
  label: z.string({ error: "label is required" }),
});

const UpdateMemoryBlockSchema = z.object({
  block_id: z.string({ error: "block_id is required" }),
  value: z.string({ error: "value is required" }),
});

const SearchMemorySchema = z.object({
  agent_id: z.string().optional(),
  query: z.string({ error: "query is required" }),
  limit: z.number().optional(),
});

const AddToArchivalSchema = z.object({
  agent_id: z.string().optional(),
  content: z.string({ error: "content is required" }),
});

// Environment variables
const LETTA_API_KEY = process.env.LETTA_API_KEY;
const DEFAULT_AGENT_ID = process.env.LETTA_DEFAULT_AGENT_ID;

// Letta Client (lazy initialization)
let lettaClient: LettaClient | null = null;

function getClient(): LettaClient {
  if (!lettaClient) {
    if (!LETTA_API_KEY) {
      throw new Error("LETTA_API_KEY environment variable is required");
    }
    lettaClient = new LettaClient({ apiKey: LETTA_API_KEY });
  }
  return lettaClient;
}

// Tool definitions
const tools: Tool[] = [
  {
    name: "list_agents",
    description: "List all Letta agents in your account. Returns agent IDs, names, and descriptions.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of agents to return (default: 50)",
        },
      },
    },
  },
  {
    name: "get_agent",
    description: "Get detailed information about a specific Letta agent, including its configuration and memory blocks.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "The agent ID. If not provided, uses LETTA_DEFAULT_AGENT_ID environment variable.",
        },
      },
    },
  },
  {
    name: "send_message",
    description: "Send a message to a Letta agent. The agent will process the message and may update its memory based on the content. Use this to trigger learning or have conversations with the agent.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "The agent ID. If not provided, uses LETTA_DEFAULT_AGENT_ID environment variable.",
        },
        message: {
          type: "string",
          description: "The message to send to the agent.",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "list_memory_blocks",
    description: "List all memory blocks attached to a Letta agent. Memory blocks contain persistent information like persona, human info, project context, etc.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "The agent ID. If not provided, uses LETTA_DEFAULT_AGENT_ID environment variable.",
        },
      },
    },
  },
  {
    name: "get_memory_block",
    description: "Get the content of a specific memory block by its label (e.g., 'persona', 'human', 'project').",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "The agent ID. If not provided, uses LETTA_DEFAULT_AGENT_ID environment variable.",
        },
        label: {
          type: "string",
          description: "The label of the memory block to retrieve (e.g., 'persona', 'human', 'project').",
        },
      },
      required: ["label"],
    },
  },
  {
    name: "update_memory_block",
    description: "Update the content of a memory block. Use this to directly modify agent memory from external sources. Warning: This completely replaces the block content.",
    inputSchema: {
      type: "object",
      properties: {
        block_id: {
          type: "string",
          description: "The block ID to update. Get this from list_memory_blocks.",
        },
        value: {
          type: "string",
          description: "The new content for the memory block.",
        },
      },
      required: ["block_id", "value"],
    },
  },
  {
    name: "search_memory",
    description: "Search the agent's archival memory for relevant information. Archival memory stores historical data that doesn't fit in the context window.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "The agent ID. If not provided, uses LETTA_DEFAULT_AGENT_ID environment variable.",
        },
        query: {
          type: "string",
          description: "Search query to find relevant memories.",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default: 10).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "add_to_archival",
    description: "Add new information to the agent's archival memory. Use this to store important information that should be retrievable later.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "The agent ID. If not provided, uses LETTA_DEFAULT_AGENT_ID environment variable.",
        },
        content: {
          type: "string",
          description: "The content to add to archival memory.",
        },
      },
      required: ["content"],
    },
  },
];

// Helper function to get agent ID
function getAgentId(providedId?: string): string {
  const agentId = providedId || DEFAULT_AGENT_ID;
  if (!agentId) {
    throw new Error(
      "agent_id is required. Either provide it in the request or set LETTA_DEFAULT_AGENT_ID environment variable."
    );
  }
  return agentId;
}

// Tool handlers
async function handleListAgents(args: { limit?: number }) {
  const client = getClient();
  const limit = args.limit || 50;
  
  // Fetch agents page
  const agentsPage = await client.agents.list({ limit });
  
  // Convert page to array
  const agents: any[] = [];
  for await (const agent of agentsPage) {
    agents.push({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      model: agent.llm_config?.model,
      created_at: agent.created_at,
    });
    if (agents.length >= limit) break;
  }
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(agents, null, 2),
      },
    ],
  };
}

async function handleGetAgent(args: { agent_id?: string }) {
  const client = getClient();
  const agentId = getAgentId(args.agent_id);
  
  const agent = await client.agents.retrieve(agentId);
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            id: agent.id,
            name: agent.name,
            description: agent.description,
            model: agent.llm_config?.model,
            embedding: agent.embedding_config?.embedding_model,
            memory_blocks: agent.memory?.blocks?.map((block: any) => ({
              id: block.id,
              label: block.label,
              value_preview: block.value?.substring(0, 200) + (block.value?.length > 200 ? "..." : ""),
            })),
            tools: agent.tools?.map((tool: any) => tool.name),
            created_at: agent.created_at,
          },
          null,
          2
        ),
      },
    ],
  };
}

async function handleSendMessage(args: { agent_id?: string; message: string }) {
  const client = getClient();
  const agentId = getAgentId(args.agent_id);
  
  const response = await client.agents.messages.create(agentId, {
    messages: [{ role: "user", content: args.message }],
  });
  
  // Extract relevant parts of the response
  const messages = response.messages || [];
  const formattedMessages = messages.map((msg: any) => {
    if (msg.message_type === "reasoning_message") {
      return { type: "reasoning", content: msg.reasoning };
    } else if (msg.message_type === "assistant_message") {
      return { type: "assistant", content: msg.content };
    } else if (msg.message_type === "tool_call_message") {
      return { type: "tool_call", name: msg.tool_call?.name, arguments: msg.tool_call?.arguments };
    } else if (msg.message_type === "tool_return_message") {
      return { type: "tool_return", content: msg.tool_return };
    }
    return { type: msg.message_type, raw: msg };
  });
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            agent_id: agentId,
            messages: formattedMessages,
            usage: response.usage,
          },
          null,
          2
        ),
      },
    ],
  };
}

async function handleListMemoryBlocks(args: { agent_id?: string }) {
  const client = getClient();
  const agentId = getAgentId(args.agent_id);
  
  const blocksPage = await client.agents.blocks.list(agentId);
  
  const blocks: any[] = [];
  for await (const block of blocksPage) {
    blocks.push({
      id: block.id,
      label: block.label,
      description: block.description,
      limit: block.limit,
      value: block.value,
    });
  }
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(blocks, null, 2),
      },
    ],
  };
}

async function handleGetMemoryBlock(args: { agent_id?: string; label: string }) {
  const client = getClient();
  const agentId = getAgentId(args.agent_id);
  
  const block = await client.agents.blocks.retrieve(args.label, { agent_id: agentId });
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            id: block.id,
            label: block.label,
            description: block.description,
            limit: block.limit,
            value: block.value,
          },
          null,
          2
        ),
      },
    ],
  };
}

async function handleUpdateMemoryBlock(args: { block_id: string; value: string }) {
  const client = getClient();
  
  const updatedBlock = await client.blocks.update(args.block_id, {
    value: args.value,
  });
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            block: {
              id: updatedBlock.id,
              label: updatedBlock.label,
              value: updatedBlock.value,
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

async function handleSearchMemory(args: { agent_id?: string; query: string; limit?: number }) {
  const client = getClient();
  const agentId = getAgentId(args.agent_id);
  const topK = args.limit || 10;
  
  const results = await client.agents.passages.search(agentId, {
    query: args.query,
    top_k: topK,
  });
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            query: args.query,
            count: results.count,
            results: results.results.map((r: any) => ({
              content: r.content,
              timestamp: r.timestamp,
              tags: r.tags,
            })),
          },
          null,
          2
        ),
      },
    ],
  };
}

async function handleAddToArchival(args: { agent_id?: string; content: string }) {
  const client = getClient();
  const agentId = getAgentId(args.agent_id);
  
  const passages = await client.agents.passages.create(agentId, {
    text: args.content,
  });
  
  // passages.create returns an array of created passages
  const created = Array.isArray(passages) ? passages[0] : passages;
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            passage: {
              id: created?.id,
              text: created?.text,
              created_at: created?.created_at,
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

// Main server setup
async function main() {
  const server = new Server(
    {
      name: "letta-cloud-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "list_agents":
          return await handleListAgents(ListAgentsSchema.parse(args));
        case "get_agent":
          return await handleGetAgent(GetAgentSchema.parse(args));
        case "send_message":
          return await handleSendMessage(SendMessageSchema.parse(args));
        case "list_memory_blocks":
          return await handleListMemoryBlocks(ListMemoryBlocksSchema.parse(args));
        case "get_memory_block":
          return await handleGetMemoryBlock(GetMemoryBlockSchema.parse(args));
        case "update_memory_block":
          return await handleUpdateMemoryBlock(UpdateMemoryBlockSchema.parse(args));
        case "search_memory":
          return await handleSearchMemory(SearchMemorySchema.parse(args));
        case "add_to_archival":
          return await handleAddToArchival(AddToArchivalSchema.parse(args));
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      const isZodError = error instanceof z.ZodError;
      const message = isZodError
        ? `Validation error: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
        : error.message;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              message,
              details: isZodError ? error.issues : (error.body || error.toString()),
            }),
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("Letta Cloud MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
