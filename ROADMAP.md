# Letta Cloud MCP ロードマップ

## 現在のバージョン: v0.1.0

### 実装済み機能

| ツール | 説明 |
|--------|------|
| `list_agents` | エージェント一覧取得 |
| `get_agent` | エージェント詳細取得 |
| `send_message` | メッセージ送信（学習トリガー） |
| `list_memory_blocks` | メモリブロック一覧 |
| `get_memory_block` | 特定ブロック取得 |
| `update_memory_block` | ブロック直接更新（上書き） |
| `search_memory` | アーカイブメモリ検索 |
| `add_to_archival` | アーカイブメモリ追加 |

---

## v0.2.0 - 実用性強化（短期）

Droid 連携で「あると便利」な機能を追加。

### 追加予定ツール

| ツール | 説明 | 優先度 | 難易度 |
|--------|------|--------|--------|
| `append_to_block` | ブロックに追記（上書きではなく結合） | 高 | 中 |
| `get_conversation_history` | 直近のメッセージ履歴を取得 | 高 | 低 |
| `create_agent` | 新規エージェント作成 | 中 | 低 |
| `delete_agent` | エージェント削除 | 低 | 低 |

### 追加理由

- **`append_to_block`**: `lessons_learned` のような追記型ブロックに必須。現状の `update_memory_block` は上書きなので、既存内容を取得→結合→更新の手間がかかる
- **`get_conversation_history`**: 「前回どこまで話したか」「最近何を学んだか」の振り返りに便利

### 実装メモ

```typescript
// append_to_block の実装イメージ
async function appendToBlock(args: { block_id: string; content: string; separator?: string }) {
  const current = await client.blocks.retrieve(args.block_id);
  const separator = args.separator || "\n";
  const newValue = current.value + separator + args.content;
  return await client.blocks.update(args.block_id, { value: newValue });
}
```

---

## v0.3.0 - ワークフロー最適化（中期）

Droid Skill との連携を強化し、定型ワークフローをサポート。

### 追加予定ツール

| ツール | 説明 | 優先度 | 難易度 |
|--------|------|--------|--------|
| `batch_update_blocks` | 複数ブロックを一括更新 | 中 | 中 |
| `summarize_and_archive` | current_work → archival への移行支援 | 中 | 中 |
| `get_agent_by_name` | 名前でエージェント検索（ID 不要） | 高 | 低 |
| Streaming 対応 | `send_message` のストリーミングレスポンス | 低 | 高 |

### 追加理由

- **`batch_update_blocks`**: セッション終了時に複数ブロック（current_work, lessons_learned 等）を一度に更新
- **`summarize_and_archive`**: 長くなった current_work を要約して archival に移動し、current_work をリセット
- **`get_agent_by_name`**: エージェント ID を覚えなくて済む。`LETTA_DEFAULT_AGENT_ID` 設定の代替

### ワークフロー例

```
セッション開始時:
  1. get_agent_by_name("AgiRity-Memory")
  2. get_memory_block("current_work") で前回の状態を確認

セッション終了時:
  1. batch_update_blocks で current_work と lessons_learned を更新
  2. （必要に応じて）summarize_and_archive で整理
```

---

## v0.4.0 - マルチエージェント対応（長期）

複数プロジェクト/エージェントの運用を想定。

### 追加予定ツール

| ツール | 説明 | 優先度 | 難易度 |
|--------|------|--------|--------|
| `list_shared_blocks` | 複数エージェントで共有されているブロック一覧 | 中 | 低 |
| `attach_block_to_agent` | 既存ブロックを別エージェントにアタッチ | 中 | 低 |
| `detach_block_from_agent` | エージェントからブロックをデタッチ | 低 | 低 |
| `clone_agent` | エージェントの複製 | 低 | 中 |
| `export_agent` | .af ファイルへエクスポート | 低 | 中 |
| `import_agent` | .af ファイルからインポート | 低 | 中 |

### 追加理由

- **共有ブロック系**: `human` ブロック（ユーザー情報）を複数プロジェクトのエージェントで共有
- **エクスポート/インポート**: エージェントのバックアップ、環境間の移行

### ユースケース

```
プロジェクト A (AgiRity):
  - persona: AgiRity 専用の記憶管理者
  - human: 共有（Akky の情報）
  - project: AgiRity 固有

プロジェクト B (別プロジェクト):
  - persona: プロジェクト B 専用
  - human: 共有（同じブロックをアタッチ）
  - project: プロジェクト B 固有
```

---

## 実装難易度サマリー

### 簡単（SDK メソッド呼び出しのみ）

- `get_conversation_history` → `client.agents.messages.list()`
- `create_agent` → `client.agents.create()`
- `delete_agent` → `client.agents.delete()`
- `get_agent_by_name` → `client.agents.list()` + filter
- `list_shared_blocks` → `client.blocks.list()`
- `attach_block_to_agent` → `client.agents.blocks.attach()`

### 中程度（ロジック追加が必要）

- `append_to_block` → 取得 → 結合 → 更新
- `batch_update_blocks` → ループ処理 + エラーハンドリング
- `summarize_and_archive` → 要約ロジック（LLM 呼び出し検討）

### 難しめ（設計検討・SDK 拡張が必要）

- Streaming 対応 → MCP の streaming 仕様理解が必要
- `export_agent` / `import_agent` → ファイル I/O + バイナリ処理

---

## 開発方針

1. **実際の使用感を優先**: 机上で考えるより、Droid で使いながら「これが欲しい」を反映
2. **シンプルに保つ**: 1 ツール = 1 責務。複雑なワークフローは Droid Skill 側で組み立てる
3. **後方互換性**: 既存ツールの引数・戻り値は変更しない（追加は OK）

---

## 貢献・フィードバック

- 「こんな機能が欲しい」→ Issue を立てるか、このロードマップを更新
- 実装したい機能があれば PR 歓迎
