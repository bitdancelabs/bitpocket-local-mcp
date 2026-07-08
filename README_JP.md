# bitpocket-local-mcp

[English](README.md) | [日本語](README_JP.md) | [繁體中文](README_ZH-TW.md) | [한국어](README_KO.md)

<p align="center">
  <em>A local wallet MCP tool for the BitPocket ecosystem, provided by <strong>BitDanceLabs</strong></em>
</p>

<p align="center">
  <a href="https://github.com/bitdancelabs/bitpocket-local-mcp">https://github.com/bitdancelabs/bitpocket-local-mcp</a>
</p>

## ガイド

`bitpocket-local-mcp` は、ユーザーのローカルマシン上で動作する BitPocket ウォレット MCP Server です。[Model Context Protocol](https://modelcontextprotocol.io/) を通じて、ローカルウォレット機能を AI Agent が直接呼び出せるツールとして公開します。これにより、Claude Code、Claude Desktop、Cursor、OpenCode などの MCP 対応クライアントは、ローカルウォレットを自動的に検出して呼び出せます。

この MCP Server が扱うローカル機能は、ウォレットアドレスの導出と署名の 2 種類のみです。ニーモニックは環境変数から注入され、ローカルプロセスのメモリ内でのみ使用されます。ファイル、ログ、ネットワークには書き込まれません。

典型的な連携フローは次のとおりです。

```text
  AI Agent (Claude / Cursor / OpenCode / ...)
        |
        |-- other MCPs
        |     naka-api-mcp / bitpocket-api-mcp / bitboom-api-mcp など
        |
        |-- bitpocket-local-mcp
              ローカルウォレットアドレス導出、BTC PSBT 署名、
              Taproot Assets PSBT 署名、メッセージ署名
```

完全なオンチェーンワークフローでは、サーバー側 MCP が署名対象の PSBT を作成し、AI Agent がその PSBT をローカルの `bitpocket-local-mcp` に渡して署名し、署名結果をサーバー側 MCP に戻してブロードキャストできます。秘密鍵とニーモニックは常にユーザーのマシン上に残ります。

## MCP Server のツール

`bitpocket-local-mcp` は現在 4 つのツールを提供しています。

- ウォレットアドレスツール：`bitpocket_wallet_get_address`。`BTC_MNEMONIC` と現在のネットワークに基づいてローカルウォレットの Taproot アドレスを導出し、公開ウォレット情報をキャッシュします。
- BTC PSBT 署名ツール：`bitpocket_wallet_sign_btc_psbt`。ローカルウォレットで BTC PSBT に署名し、入力の指定と任意の finalize をサポートします。
- Taproot Assets PSBT 署名ツール：`bitpocket_wallet_sign_ta_psbt`。ローカルウォレットで Taproot Assets PSBT に署名し、署名済み入力ごとの `tapKeySig` を返します。
- メッセージ署名ツール：`bitpocket_wallet_sign_message`。任意の文字列に対して BTC ECDSA message signature を生成し、ログイン、認証、メッセージ検証に使用できます。

### `bitpocket_wallet_get_address`

アドレス、公開鍵、x-only 公開鍵、fingerprint、導出パス、ネットワーク、ローカルキャッシュパスなどの公開ウォレット情報を導出して返します。

- 入力：なし
- 出力：`walletAddress`、`publicKey`、`xOnlyPublicKey`、`fingerprint`、`network`、`storage` などの公開情報

### `bitpocket_wallet_sign_btc_psbt`

BTC PSBT に署名します。

| パラメータ | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `psbt` | string | はい | 署名対象の base64 エンコード済み PSBT |
| `auto_finalized` | boolean | いいえ | 署名後に finalize を試行するかどうか。デフォルトは `false` |
| `to_sign_inputs` | array | いいえ | 署名する入力を指定します。省略または空配列の場合、署名可能なすべての入力に署名します |

`to_sign_inputs` でサポートされるフィールド：

| パラメータ | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `index` | number | はい | 入力インデックス。非負整数である必要があります |
| `public_key` | string | いいえ | 呼び出し元から渡される公開鍵識別子。互換性のためだけに保持されています |
| `address` | string | いいえ | 呼び出し元から渡されるアドレス識別子。互換性のためだけに保持されています |
| `sighash_types` | number[] | いいえ | 許可される sighash type の一覧 |
| `disable_tweak_signer` | boolean | いいえ | Taproot tweak signer を無効にするかどうか |
| `use_tweaked_signer` | boolean | いいえ | Taproot tweaked signer を使用するかどうか。`disable_tweak_signer` より優先されます |

### `bitpocket_wallet_sign_ta_psbt`

Taproot Assets PSBT に署名し、署名済み入力ごとの `tapKeySig` を返します。

- 入力構造は `bitpocket_wallet_sign_btc_psbt` と同じです。
- Taproot Assets のシナリオでは、ローカルでは finalize を実行しません。署名には常に tweaked signer を使用し、関連パラメータは互換性のためだけに保持されています。

### `bitpocket_wallet_sign_message`

任意の空でない文字列に対して BTC ECDSA メッセージ署名を生成します。

| パラメータ | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `message` | string | はい | 署名対象の文字列 |

出力には `network`、`walletAddress`、`message`、`signature` などのフィールドが含まれます。

## クイックスタート

### 環境変数の設定

| 変数 | 説明 |
| --- | --- |
| `BTC_MNEMONIC` | 必須。BIP39 ウォレットニーモニック。ローカルメモリ内でのみ使用されます |

> セキュリティ上の注意：`BTC_MNEMONIC` は資産の制御権を表します。必ずローカル環境変数としてのみ注入してください。コードリポジトリにコミットしたり、ログに出力したり、オンラインサービスへ送信したりしないでください。

### for Claude Code

次のコマンドで簡単にインストールできます。

```bash
claude mcp add -s user bitpocket-local-mcp \
  -e BTC_MNEMONIC="<YOUR_MNEMONIC>" \
  -- npx -y @bitdancelabs/bitpocket-local-mcp@latest
```

### for Claude Desktop / その他の MCP クライアント

クライアントが JSON 設定を使用する場合は、次の stdio 設定を参考にしてください。

```json
{
  "mcpServers": {
    "bitpocket-local-mcp": {
      "command": "npx",
      "args": ["-y", "@bitdancelabs/bitpocket-local-mcp@latest"],
      "env": {
        "BTC_MNEMONIC": "<YOUR_MNEMONIC>"
      }
    }
  }
}
```

### for OpenCode

次の設定を `~/.config/opencode/opencode.json` に追加してください。

```json
{
  "mcp": {
    "bitpocket-local-mcp": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "@bitdancelabs/bitpocket-local-mcp@latest"
      ],
      "environment": {
        "BTC_MNEMONIC": "<YOUR_MNEMONIC>"
      }
    }
  }
}
```

## 対話例

MCP Server が有効になると、Agent は次のような自然言語リクエストに応答できます。

```text
私の BTC ウォレットアドレスは何ですか？

# bitpocket_wallet_get_address を呼び出します
```

```text
次の文字列に署名してください: hello bitpocket-bitpocket-local-mcp

# bitpocket_wallet_sign_message を呼び出します
```

```text
この BTC PSBT に署名してください: <base64-psbt>

# bitpocket_wallet_sign_btc_psbt を呼び出します
```

```text
この Taproot Assets PSBT に署名してください: <base64-psbt>

# bitpocket_wallet_sign_ta_psbt を呼び出します
```

## 開発者向け

```bash
# 依存関係をインストール
npm install

# TypeScript をコンパイル
npm run build

# ローカル開発（watch mode）
npm run dev
```

ビルド出力は `dist/` ディレクトリに書き込まれます。

## License

MIT © BitDance-Labs
