# Letta Cloud MCP Server

[English](./README.md) | 日本語

[Letta Cloud](https://app.letta.com) に接続するための MCP (Model Context Protocol) サーバーです。

Factory Droid、Claude Code、Cursor などの MCP 対応エージェントから Letta Cloud のステートフルメモリシステムを利用できます。

## 特徴

- **Letta Cloud ネイティブ対応** - セルフホスト不要、API キーのみで接続
- **メモリブロック操作** - persona, human, project などのメモリを読み書き
- **エージェント対話** - メッセージ送信でエージェントの学習をトリガー
- **アーカイブメモリ** - 長期記憶の検索・追加

## インストール

```bash
# リポジトリをクローン
git clone https://github.com/your-username/letta-cloud-mcp.git
cd letta-cloud-mcp

# 依存関係をインストール
npm install

# ビルド
npm run build
```

### グローバルインストール（オプション）

```bash
npm install -g .
```

## 設定

### 環境変数

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `LETTA_API_KEY` | ✅ | Letta Cloud API キー（[取得はこちら](https://app.letta.com/api-keys)） |
| `LETTA_DEFAULT_AGENT_ID` | - | デフォルトで使用するエージェント ID |

### Factory Droid での設定

`~/.factory/mcp.json` または `.factory/mcp.json`:

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

### Claude Code での設定

```bash
claude mcp add letta-cloud \
  --command "node /path/to/letta-cloud-mcp/dist/index.js" \
  --env LETTA_API_KEY=your-api-key-here \
  --env LETTA_DEFAULT_AGENT_ID=agent-xxx
```

### Cursor での設定

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

## 利用可能なツール

### エージェント管理

| ツール | 説明 |
|--------|------|
| `list_agents` | アカウント内のエージェント一覧を取得 |
| `get_agent` | エージェントの詳細情報を取得 |

### メッセージング

| ツール | 説明 |
|--------|------|
| `send_message` | エージェントにメッセージを送信（学習トリガー） |

### メモリブロック操作

| ツール | 説明 |
|--------|------|
| `list_memory_blocks` | エージェントのメモリブロック一覧 |
| `get_memory_block` | 特定のメモリブロック内容を取得 |
| `update_memory_block` | メモリブロックを直接更新 |

### アーカイブメモリ

| ツール | 説明 |
|--------|------|
| `search_memory` | アーカイブメモリを検索 |
| `add_to_archival` | アーカイブメモリに追加 |

## 使用例

### Droid からの使用例

```
> Letta エージェント一覧を取得して
(Droid が list_agents ツールを呼び出し)

> 今日学んだことを Letta に記録して：
> ipcMain の実装で preload スクリプトの重要性を理解した
(Droid が send_message ツールで学びを送信 → Letta が自律的にメモリ更新)

> プロジェクトのメモリブロックを確認して
(Droid が get_memory_block ツールで project ブロックを取得)
```

### プログラム的な使用

```typescript
// MCP クライアントから
await mcpClient.callTool("send_message", {
  message: "記憶して：ESLint の設定で flat config を採用した理由は..."
});

// メモリを直接更新（外部からの注入）
await mcpClient.callTool("update_memory_block", {
  block_id: "block-xxx",
  value: "更新された内容..."
});
```

## アーキテクチャ

```
┌─────────────┐     MCP Protocol     ┌──────────────────┐     REST API     ┌──────────────┐
│   Droid     │ ◄──────────────────► │  letta-cloud-mcp │ ◄──────────────► │ Letta Cloud  │
│ Claude Code │       (stdio)        │                  │    (HTTPS)       │              │
│   Cursor    │                      │  @letta-ai/      │                  │ app.letta.com│
└─────────────┘                      │  letta-client    │                  └──────────────┘
                                     └──────────────────┘
```

## Letta Cloud vs セルフホスト

| 項目 | Letta Cloud | セルフホスト |
|------|-------------|-------------|
| セットアップ | API キーのみ | Docker + DB |
| 管理 | 不要 | 自分で運用 |
| 料金 | 従量課金 | インフラ費用 |
| この MCP | ✅ 対応 | ❌ 非対応（[oculairmedia版](https://github.com/oculairmedia/Letta-MCP-server)を使用） |

## トラブルシューティング

### "LETTA_API_KEY environment variable is required"

API キーが設定されていません。[Letta Cloud](https://app.letta.com/api-keys) から取得してください。

### "agent_id is required"

`LETTA_DEFAULT_AGENT_ID` を設定するか、ツール呼び出し時に `agent_id` を指定してください。

### 接続エラー

1. API キーが有効か確認
2. [Letta Cloud ステータス](https://status.letta.com) を確認
3. ネットワーク接続を確認

## ライセンス

MIT

## 関連リンク

- [Letta Cloud](https://app.letta.com)
- [Letta Documentation](https://docs.letta.com)
- [Letta TypeScript SDK](https://github.com/letta-ai/letta-node)
- [Model Context Protocol](https://modelcontextprotocol.io)
