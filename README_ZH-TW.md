# bitpocket-local-mcp

[English](README.md) | [日本語](README_JP.md) | [繁體中文](README_ZH-TW.md) | [한국어](README_KO.md)

<p align="center">
  <em>A local wallet MCP tool for the BitPocket ecosystem, provided by <strong>BitDanceLabs</strong></em>
</p>

<p align="center">
  <a href="https://github.com/bitdancelabs/bitpocket-local-mcp">https://github.com/bitdancelabs/bitpocket-local-mcp</a>
  <br />
  <a href="https://www.npmjs.com/package/@bitdancelabs/bitpocket-local-mcp">https://www.npmjs.com/package/@bitdancelabs/bitpocket-local-mcp</a>
</p>

## 指南

`bitpocket-local-mcp` 是一個執行在使用者本機上的 BitPocket 錢包 MCP Server。它透過 [Model Context Protocol](https://modelcontextprotocol.io/) 將本地錢包能力公開為 AI Agent 可直接呼叫的工具，讓 Claude Code、Claude Desktop、Cursor、OpenCode 等支援 MCP 的用戶端可以自動探索並呼叫本地錢包。

這個 MCP Server 只處理兩類本地能力：派生錢包地址與簽名。助記詞透過環境變數注入，只在本機程序記憶體中使用，不會寫入檔案、日誌，也不會透過網路傳送。

典型協作流程如下：

```text
  AI Agent (Claude / Cursor / OpenCode / ...)
        |
        |-- other MCPs
        |     例如 naka-api-mcp / bitpocket-api-mcp / bitboom-api-mcp
        |
        |-- bitpocket-local-mcp
              本地錢包地址派生、BTC PSBT 簽名、
              Taproot Assets PSBT 簽名、訊息簽名
```

在完整的鏈上互動流程中，服務端 MCP 可以負責建構待簽名 PSBT，AI Agent 將該 PSBT 交給本地 `bitpocket-local-mcp` 簽名，再把簽名結果交回服務端 MCP 進行後續廣播。私鑰與助記詞始終保留在使用者的機器上。

## MCP Server 的工具

`bitpocket-local-mcp` 目前提供 4 個工具：

- 錢包地址工具：`bitpocket_wallet_get_address`，根據 `BTC_MNEMONIC` 與目前網路派生本地錢包 Taproot 地址，並快取公開錢包資訊。
- BTC PSBT 簽名工具：`bitpocket_wallet_sign_btc_psbt`，使用本地錢包簽署 BTC PSBT，支援指定輸入與可選 finalize。
- Taproot Assets PSBT 簽名工具：`bitpocket_wallet_sign_ta_psbt`，使用本地錢包簽署 Taproot Assets PSBT，並回傳每個已簽名輸入的 `tapKeySig`。
- 訊息簽名工具：`bitpocket_wallet_sign_message`，對任意字串產生 BTC ECDSA message signature，可用於登入、認證或訊息驗證。

### `bitpocket_wallet_get_address`

派生並回傳錢包公開資訊，包括地址、公鑰、x-only 公鑰、fingerprint、派生路徑、網路與本地快取路徑。

- 輸入：無
- 輸出：`walletAddress`、`publicKey`、`xOnlyPublicKey`、`fingerprint`、`network`、`storage` 等公開資訊

### `bitpocket_wallet_sign_btc_psbt`

簽署 BTC PSBT。

| 參數 | 類型 | 必填 | 說明 |
| --- | --- | --- | --- |
| `psbt` | string | 是 | base64 編碼的待簽名 PSBT |
| `auto_finalized` | boolean | 否 | 是否在簽名後嘗試 finalize，預設為 `false` |
| `to_sign_inputs` | array | 否 | 指定要簽名的輸入；省略或傳入空陣列表示簽署所有可簽輸入 |

`to_sign_inputs` 支援欄位：

| 參數 | 類型 | 必填 | 說明 |
| --- | --- | --- | --- |
| `index` | number | 是 | 輸入序號，必須為非負整數 |
| `public_key` | string | 否 | 呼叫方傳入的公鑰識別符，僅為相容性保留 |
| `address` | string | 否 | 呼叫方傳入的地址識別符，僅為相容性保留 |
| `sighash_types` | number[] | 否 | 允許的 sighash type 清單 |
| `disable_tweak_signer` | boolean | 否 | 是否停用 Taproot tweak signer |
| `use_tweaked_signer` | boolean | 否 | 是否使用 Taproot tweaked signer，優先於 `disable_tweak_signer` |

### `bitpocket_wallet_sign_ta_psbt`

簽署 Taproot Assets PSBT，並回傳每個已簽名輸入的 `tapKeySig`。

- 輸入結構與 `bitpocket_wallet_sign_btc_psbt` 相同。
- 在 Taproot Assets 場景下，本地不執行 finalize。簽名一律使用 tweaked signer，相關參數僅為相容性保留。

### `bitpocket_wallet_sign_message`

對任意非空字串產生 BTC ECDSA 訊息簽名。

| 參數 | 類型 | 必填 | 說明 |
| --- | --- | --- | --- |
| `message` | string | 是 | 待簽名字串 |

輸出包含 `network`、`walletAddress`、`message`、`signature` 等欄位。

## 快速開始

### 設定環境變數

| 變數 | 說明 |
| --- | --- |
| `BTC_MNEMONIC` | 必填。BIP39 錢包助記詞，只在本地記憶體中使用 |

> 安全提示：`BTC_MNEMONIC` 代表資產控制權。請只透過本地環境變數注入，不要提交到程式碼倉庫，不要列印到日誌，也不要傳送給任何線上服務。

### for Claude Code

使用以下命令快速安裝：

```bash
claude mcp add -s user bitpocket-local-mcp \
  -e BTC_MNEMONIC="<YOUR_MNEMONIC>" \
  -- npx -y @bitdancelabs/bitpocket-local-mcp@latest
```

### for Claude Desktop / 其他 MCP 用戶端

如果用戶端使用 JSON 設定，可以參考以下 stdio 設定：

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

將以下設定追加到 `~/.config/opencode/opencode.json`：

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

## 範例互動

MCP Server 啟用後，Agent 可回應以下自然語言請求：

```text
我的 BTC 錢包地址是什麼？

# 呼叫 bitpocket_wallet_get_address
```

```text
請簽名如下字串 hello bitpocket-bitpocket-local-mcp

# 呼叫 bitpocket_wallet_sign_message
```

```text
請幫我簽名這個 BTC PSBT：<base64-psbt>

# 呼叫 bitpocket_wallet_sign_btc_psbt
```

```text
請幫我簽名這個 Taproot Assets PSBT：<base64-psbt>

# 呼叫 bitpocket_wallet_sign_ta_psbt
```

## 開發者

```bash
# 安裝依賴
npm install

# 編譯 TypeScript
npm run build

# 本地開發（watch mode）
npm run dev
```

建置輸出位於 `dist/` 目錄。

## License

MIT © BitDance-Labs
