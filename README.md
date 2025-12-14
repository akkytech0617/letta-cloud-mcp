# Letta Cloud MCP Server

English | [日本語](./README_ja.md)

An MCP (Model Context Protocol) server for connecting to [Letta Cloud](https://app.letta.com).

Use Letta Cloud's stateful memory system from MCP-compatible agents like Factory Droid, Claude Code, and Cursor.

## Features

- **Native Letta Cloud Support** - No self-hosting required, connect with just an API key
- **Memory Block Operations** - Read and write memory blocks like persona, human, project
- **Agent Interaction** - Send messages to trigger agent learning
- **Archival Memory** - Search and add to long-term memory

## Installation

```bash
# Clone the repository
git clone https://github.com/wasedaigo/letta-cloud-mcp.git
cd letta-cloud-mcp

# Install dependencies
npm install

# Build
npm run build
```

### Global Installation (Optional)

```bash
npm install -g .
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LETTA_API_KEY` | ✅ | Letta Cloud API key ([Get it here](https://app.letta.com/api-keys)) |
| `LETTA_DEFAULT_AGENT_ID` | - | Default agent ID to use |

### Factory Droid Configuration

`~/.factory/mcp.json` or `.factory/mcp.json`:

```json
{
  "mcpServers": {
    "letta-cloud": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/letta-cloud-mcp/dist/index.js"],
      "env": {
        "LETTA_API_KEY": "your-api-key-here",
        "LETTA_DEFAULT_AGENT_ID": "agent-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
      }
    }
  }
}
```

### Claude Code Configuration

```bash
claude mcp add letta-cloud \
  --command "node /path/to/letta-cloud-mcp/dist/index.js" \
  --env LETTA_API_KEY=your-api-key-here \
  --env LETTA_DEFAULT_AGENT_ID=agent-xxx
```

### Cursor Configuration

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "letta-cloud": {
      "command": "node",
      "args": ["/path/to/letta-cloud-mcp/dist/index.js"],
      "env": {
        "LETTA_API_KEY": "your-api-key-here",
        "LETTA_DEFAULT_AGENT_ID": "agent-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
      }
    }
  }
}
```

## Available Tools

### Agent Management

| Tool | Description |
|------|-------------|
| `list_agents` | List all agents in your account |
| `get_agent` | Get detailed information about an agent |

### Messaging

| Tool | Description |
|------|-------------|
| `send_message` | Send a message to an agent (triggers learning) |

### Memory Block Operations

| Tool | Description |
|------|-------------|
| `list_memory_blocks` | List memory blocks attached to an agent |
| `get_memory_block` | Get contents of a specific memory block |
| `update_memory_block` | Directly update a memory block |

### Archival Memory

| Tool | Description |
|------|-------------|
| `search_memory` | Search archival memory |
| `add_to_archival` | Add content to archival memory |

## Usage Examples

### Using from Droid

```
> List my Letta agents
(Droid calls list_agents tool)

> Save what I learned today to Letta:
> Understood the importance of preload scripts in ipcMain implementation
(Droid sends the learning via send_message tool → Letta autonomously updates memory)

> Show me the project memory block
(Droid calls get_memory_block tool for the project block)
```

### Programmatic Usage

```typescript
// From an MCP client
await mcpClient.callTool("send_message", {
  message: "Remember: Adopted ESLint flat config because..."
});

// Direct memory update (external injection)
await mcpClient.callTool("update_memory_block", {
  block_id: "block-xxx",
  value: "Updated content..."
});
```

## Architecture

```
┌─────────────┐     MCP Protocol     ┌──────────────────┐     REST API     ┌──────────────┐
│   Droid     │ ◄──────────────────► │  letta-cloud-mcp │ ◄──────────────► │ Letta Cloud  │
│ Claude Code │       (stdio)        │                  │    (HTTPS)       │              │
│   Cursor    │                      │  @letta-ai/      │                  │ app.letta.com│
└─────────────┘                      │  letta-client    │                  └──────────────┘
                                     └──────────────────┘
```

## Letta Cloud vs Self-Hosted

| Aspect | Letta Cloud | Self-Hosted |
|--------|-------------|-------------|
| Setup | API key only | Docker + DB |
| Management | Not required | Self-managed |
| Pricing | Pay-as-you-go | Infrastructure costs |
| This MCP | ✅ Supported | ❌ Not supported (use [oculairmedia version](https://github.com/oculairmedia/Letta-MCP-server)) |

## Troubleshooting

### "LETTA_API_KEY environment variable is required"

API key is not set. Get one from [Letta Cloud](https://app.letta.com/api-keys).

### "agent_id is required"

Set `LETTA_DEFAULT_AGENT_ID` or specify `agent_id` when calling tools.

### Connection Errors

1. Verify API key is valid
2. Check [Letta Cloud Status](https://status.letta.com)
3. Verify network connectivity

## License

MIT

## Related Links

- [Letta Cloud](https://app.letta.com)
- [Letta Documentation](https://docs.letta.com)
- [Letta TypeScript SDK](https://github.com/letta-ai/letta-node)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [日本語版 README](./README_ja.md)
