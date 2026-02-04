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

const AppendToBlockSchema = z.object({
  block_id: z.string({ error: "block_id is required" }),
  content: z.string({ error: "content is required" }),
  separator: z.string().optional(),
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

const SummarizeAndArchiveSchema = z.object({
  agent_id: z.string().optional(),
  block_label: z.string().optional(),
  reset_value: z.string().optional(),
});

const GetConversationHistorySchema = z.object({
  agent_id: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
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
    name: "append_to_block",
    description: "Append content to an existing memory block without overwriting it. Perfect for append-only blocks like 'lessons_learned' where you want to add new entries without manually fetching and concatenating the existing content.",
    inputSchema: {
      type: "object",
      properties: {
        block_id: {
          type: "string",
          description: "The block ID to append to. Get this from list_memory_blocks.",
        },
        content: {
          type: "string",
          description: "The content to append to the memory block.",
        },
        separator: {
          type: "string",
          description: "Separator to use between existing content and new content (default: '\\n').",
        },
      },
      required: ["block_id", "content"],
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
  {
    name: "summarize_and_archive",
    description: "Summarize a memory block (default: 'current_work') and archive it. This tool retrieves the block content, sends it to the agent for summarization, stores the summary in archival memory, and resets the block. Useful for archiving long session work at the end of a session.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "The agent ID. If not provided, uses LETTA_DEFAULT_AGENT_ID environment variable.",
        },
        block_label: {
          type: "string",
          description: "The label of the memory block to summarize and archive (default: 'current_work').",
        },
        reset_value: {
          type: "string",
          description: "The value to reset the block to after archiving (default: empty string).",
        },
      },
    },
  },
  {
    name: "get_conversation_history",
    description: "Retrieve recent message history from an agent's conversation. Useful for reviewing 'what was discussed last time' or 'what the agent learned recently'. Returns messages in the requested order (default: newest first).",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "The agent ID. If not provided, uses LETTA_DEFAULT_AGENT_ID environment variable.",
        },
        limit: {
          type: "number",
          description: "Maximum number of messages to return (default: 10, max: 100).",
        },
        before: {
          type: "string",
          description: "Message ID for pagination - retrieve messages before this ID.",
        },
        after: {
          type: "string",
          description: "Message ID for pagination - retrieve messages after this ID.",
        },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order: 'asc' for oldest first, 'desc' for newest first (default: 'desc').",
        },
      },
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

async function handleAppendToBlock(args: { block_id: string; content: string; separator?: string }) {
  const client = getClient();
  
  // Retrieve the current block
  const currentBlock = await client.blocks.retrieve(args.block_id);
  
  // Determine separator (default to newline)
  const separator = args.separator !== undefined ? args.separator : "\n";
  
  // Append content with separator
  const newValue = currentBlock.value + separator + args.content;
  
  // Update the block with the new value
  const updatedBlock = await client.blocks.update(args.block_id, {
    value: newValue,
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
            appended_content: args.content,
            separator_used: separator,
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

async function handleSummarizeAndArchive(args: { agent_id?: string; block_label?: string; reset_value?: string }) {
  const client = getClient();
  const agentId = getAgentId(args.agent_id);
  const blockLabel = args.block_label || "current_work";
  const resetValue = args.reset_value ?? "";
  
  // 1. Get the memory block content
  const block = await client.agents.blocks.retrieve(blockLabel, { agent_id: agentId });
  
  if (!block.value || block.value.trim() === "") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              message: `Memory block '${blockLabel}' is empty. Nothing to archive.`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
  
  const originalContent = block.value;
  
  // 2. Send message to agent to summarize the content
  const summarizePrompt = `Please summarize the following content concisely for archival purposes. Focus on key decisions, outcomes, and important information. Respond with ONLY the summary, no preamble:\n\n---\n${originalContent}\n---`;
  
  const response = await client.agents.messages.create(agentId, {
    messages: [{ role: "user", content: summarizePrompt }],
  });
  
  // Extract the assistant's response (summary)
  const responseMessages = response.messages || [];
  let summary = "";
  for (const msg of responseMessages as any[]) {
    if (msg.message_type === "assistant_message" && msg.content) {
      // Handle both string and array content types
      if (typeof msg.content === "string") {
        summary = msg.content;
      } else if (Array.isArray(msg.content)) {
        summary = msg.content.map((c: any) => c.text || "").join("");
      }
      break;
    }
  }
  
  if (!summary) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              message: "Failed to generate summary from agent.",
              raw_response: responseMessages,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
  
  // 3. Add summary to archival memory with metadata
  const archiveContent = `[Archived from '${blockLabel}' at ${new Date().toISOString()}]\n\n${summary}`;
  
  const passages = await client.agents.passages.create(agentId, {
    text: archiveContent,
  });
  
  const created = Array.isArray(passages) ? passages[0] : passages;
  
  // 4. Reset the memory block (use agent-scoped API for consistency)
  await client.agents.blocks.update(blockLabel, {
    agent_id: agentId,
    value: resetValue,
  });
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            block_label: blockLabel,
            original_length: originalContent.length,
            summary_length: summary.length,
            summary: summary,
            archived_passage: {
              id: created?.id,
              text: archiveContent,
              created_at: created?.created_at,
            },
            block_reset_to: resetValue,
          },
          null,
          2
        ),
      },
    ],
  };
}

function normalizeMessage(message: any): any {
  const baseMessage: any = {
    id: message.id,
    message_type: message.message_type,
    date: message.date,
  };
  
  const optionalFields = ['content', 'reasoning', 'tool_call', 'tool_return', 'name', 'summary'];
  for (const field of optionalFields) {
    if (field in message) {
      baseMessage[field] = message[field];
    }
  }
  
  return baseMessage;
}

async function handleGetConversationHistory(args: {
  agent_id?: string;
  limit?: number;
  before?: string;
  after?: string;
  order?: "asc" | "desc";
}) {
  const client = getClient();
  const agentId = getAgentId(args.agent_id);
  
  const limit = args.limit ? Math.min(args.limit, 100) : 10;
  const fetchLimit = limit + 1;
  const order = args.order || "desc";
  
  const messagesPage = await client.agents.messages.list(agentId, {
    limit: fetchLimit,
    before: args.before,
    after: args.after,
    order,
  });
  
  const messages: any[] = [];
  for await (const message of messagesPage) {
    if (messages.length >= fetchLimit) break;
    messages.push(normalizeMessage(message));
  }
  
  const hasMore = messages.length > limit;
  if (hasMore) {
    messages.length = limit;
  }
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            agent_id: agentId,
            count: messages.length,
            messages,
            pagination: { limit, order, has_more: hasMore },
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
        case "append_to_block":
          return await handleAppendToBlock(AppendToBlockSchema.parse(args));
        case "search_memory":
          return await handleSearchMemory(SearchMemorySchema.parse(args));
        case "add_to_archival":
          return await handleAddToArchival(AddToArchivalSchema.parse(args));
        case "summarize_and_archive":
          return await handleSummarizeAndArchive(SummarizeAndArchiveSchema.parse(args));
        case "get_conversation_history":
          return await handleGetConversationHistory(GetConversationHistorySchema.parse(args));
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
