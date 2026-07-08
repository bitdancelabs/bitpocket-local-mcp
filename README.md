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

## Guide

`bitpocket-local-mcp` is a BitPocket wallet MCP Server that runs on the user's local machine. Through the [Model Context Protocol](https://modelcontextprotocol.io/), it exposes local wallet capabilities as tools that AI Agents can call directly, allowing MCP clients such as Claude Code, Claude Desktop, Cursor, and OpenCode to automatically discover and invoke the local wallet.

This MCP Server only handles two types of local capabilities: deriving wallet addresses and signing. The mnemonic is injected through an environment variable, used only in local process memory, and is never written to files, logs, or sent over the network.

A typical collaboration flow looks like this:

```text
  AI Agent (Claude / Cursor / OpenCode / ...)
        |
        |-- other MCPs
        |     such as naka-api-mcp / bitpocket-api-mcp / bitboom-api-mcp
        |
        |-- bitpocket-local-mcp
              local wallet address derivation, BTC PSBT signing,
              Taproot Assets PSBT signing, message signing
```

In a complete on-chain workflow, a server-side MCP can construct the PSBT to be signed, the AI Agent passes that PSBT to the local `bitpocket-local-mcp` for signing, and then sends the signed result back to the server-side MCP for broadcasting. The private key and mnemonic always stay on the user's machine.

## MCP Server Tools

`bitpocket-local-mcp` currently provides 4 tools:

- Wallet address tool: `bitpocket_wallet_get_address`, which derives the local wallet Taproot address from `BTC_MNEMONIC` and the current network, then caches public wallet information.
- BTC PSBT signing tool: `bitpocket_wallet_sign_btc_psbt`, which signs a BTC PSBT with the local wallet and supports selected inputs and optional finalization.
- Taproot Assets PSBT signing tool: `bitpocket_wallet_sign_ta_psbt`, which signs a Taproot Assets PSBT with the local wallet and returns the `tapKeySig` for each signed input.
- Message signing tool: `bitpocket_wallet_sign_message`, which generates a BTC ECDSA message signature for any string and can be used for login, authentication, or message verification.

### `bitpocket_wallet_get_address`

Derives and returns public wallet information, including the address, public key, x-only public key, fingerprint, derivation path, network, and local cache path.

- Input: none
- Output: public information such as `walletAddress`, `publicKey`, `xOnlyPublicKey`, `fingerprint`, `network`, and `storage`

### `bitpocket_wallet_sign_btc_psbt`

Signs a BTC PSBT.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `psbt` | string | Yes | The base64-encoded PSBT to sign |
| `auto_finalized` | boolean | No | Whether to attempt finalization after signing. Defaults to `false` |
| `to_sign_inputs` | array | No | Specifies which inputs to sign. Omit it or pass an empty array to sign all signable inputs |

Supported fields in `to_sign_inputs`:

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `index` | number | Yes | Input index. Must be a non-negative integer |
| `public_key` | string | No | Public key identifier passed by the caller. Kept for compatibility only |
| `address` | string | No | Address identifier passed by the caller. Kept for compatibility only |
| `sighash_types` | number[] | No | List of allowed sighash types |
| `disable_tweak_signer` | boolean | No | Whether to disable the Taproot tweak signer |
| `use_tweaked_signer` | boolean | No | Whether to use the Taproot tweaked signer. Takes precedence over `disable_tweak_signer` |

### `bitpocket_wallet_sign_ta_psbt`

Signs a Taproot Assets PSBT and returns the `tapKeySig` for each signed input.

- The input structure is the same as `bitpocket_wallet_sign_btc_psbt`.
- In Taproot Assets scenarios, local finalization is not performed. Signing always uses the tweaked signer, and related parameters are kept only for compatibility.

### `bitpocket_wallet_sign_message`

Generates a BTC ECDSA message signature for any non-empty string.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `message` | string | Yes | The string to sign |

The output includes fields such as `network`, `walletAddress`, `message`, and `signature`.

## Quick Start

### Configure Environment Variables

| Variable | Description |
| --- | --- |
| `BTC_MNEMONIC` | Required. BIP39 wallet mnemonic, used only in local memory |

> Security note: `BTC_MNEMONIC` represents control over the assets. Inject it only through a local environment variable. Do not commit it to a code repository, print it to logs, or send it to any online service.

### for Claude Code

Use the following command for quick installation:

```bash
claude mcp add -s user bitpocket-local-mcp \
  -e BTC_MNEMONIC="<YOUR_MNEMONIC>" \
  -- npx -y @bitdancelabs/bitpocket-local-mcp@latest
```

### for Claude Desktop / Other MCP Clients

If your client uses JSON configuration, use the following stdio configuration as a reference:

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

Append the following configuration to `~/.config/opencode/opencode.json`:

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

## Example Interactions

After the MCP Server is activated, the Agent can respond to natural-language requests such as:

```text
What is my BTC wallet address?

# Calls bitpocket_wallet_get_address
```

```text
Please sign the following string: hello bitpocket-bitpocket-local-mcp

# Calls bitpocket_wallet_sign_message
```

```text
Please sign this BTC PSBT: <base64-psbt>

# Calls bitpocket_wallet_sign_btc_psbt
```

```text
Please sign this Taproot Assets PSBT: <base64-psbt>

# Calls bitpocket_wallet_sign_ta_psbt
```

## Developers

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run build

# Local development (watch mode)
npm run dev
```

Build output is written to the `dist/` directory.

## License

MIT © BitDance-Labs
