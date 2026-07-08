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

## 가이드

`bitpocket-local-mcp`는 사용자의 로컬 머신에서 실행되는 BitPocket 지갑 MCP Server입니다. [Model Context Protocol](https://modelcontextprotocol.io/)을 통해 로컬 지갑 기능을 AI Agent가 직접 호출할 수 있는 도구로 노출하므로, Claude Code, Claude Desktop, Cursor, OpenCode 같은 MCP 지원 클라이언트가 로컬 지갑을 자동으로 발견하고 호출할 수 있습니다.

이 MCP Server는 두 가지 로컬 기능만 처리합니다: 지갑 주소 파생과 서명입니다. 니모닉은 환경 변수를 통해 주입되며, 로컬 프로세스 메모리 안에서만 사용됩니다. 파일이나 로그에 기록되지 않고, 네트워크로 전송되지도 않습니다.

일반적인 협업 흐름은 다음과 같습니다.

```text
  AI Agent (Claude / Cursor / OpenCode / ...)
        |
        |-- other MCPs
        |     예: naka-api-mcp / bitpocket-api-mcp / bitboom-api-mcp
        |
        |-- bitpocket-local-mcp
              로컬 지갑 주소 파생, BTC PSBT 서명,
              Taproot Assets PSBT 서명, 메시지 서명
```

완전한 온체인 워크플로에서는 서버 측 MCP가 서명할 PSBT를 만들고, AI Agent가 해당 PSBT를 로컬 `bitpocket-local-mcp`에 전달해 서명한 뒤, 서명 결과를 다시 서버 측 MCP로 보내 브로드캐스트할 수 있습니다. 개인 키와 니모닉은 항상 사용자의 머신에 남아 있습니다.

## MCP Server 도구

`bitpocket-local-mcp`는 현재 4개의 도구를 제공합니다.

- 지갑 주소 도구: `bitpocket_wallet_get_address`. `BTC_MNEMONIC`과 현재 네트워크를 기준으로 로컬 지갑의 Taproot 주소를 파생하고 공개 지갑 정보를 캐시합니다.
- BTC PSBT 서명 도구: `bitpocket_wallet_sign_btc_psbt`. 로컬 지갑으로 BTC PSBT에 서명하며, 입력 지정과 선택적 finalize를 지원합니다.
- Taproot Assets PSBT 서명 도구: `bitpocket_wallet_sign_ta_psbt`. 로컬 지갑으로 Taproot Assets PSBT에 서명하고, 서명된 각 입력의 `tapKeySig`를 반환합니다.
- 메시지 서명 도구: `bitpocket_wallet_sign_message`. 임의의 문자열에 대한 BTC ECDSA message signature를 생성하며, 로그인, 인증, 메시지 검증에 사용할 수 있습니다.

### `bitpocket_wallet_get_address`

주소, 공개 키, x-only 공개 키, fingerprint, 파생 경로, 네트워크, 로컬 캐시 경로 등 공개 지갑 정보를 파생해 반환합니다.

- 입력: 없음
- 출력: `walletAddress`, `publicKey`, `xOnlyPublicKey`, `fingerprint`, `network`, `storage` 등의 공개 정보

### `bitpocket_wallet_sign_btc_psbt`

BTC PSBT에 서명합니다.

| 매개변수 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `psbt` | string | 예 | base64로 인코딩된 서명 대상 PSBT |
| `auto_finalized` | boolean | 아니요 | 서명 후 finalize를 시도할지 여부. 기본값은 `false` |
| `to_sign_inputs` | array | 아니요 | 서명할 입력을 지정합니다. 생략하거나 빈 배열을 전달하면 서명 가능한 모든 입력에 서명합니다 |

`to_sign_inputs`에서 지원하는 필드:

| 매개변수 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `index` | number | 예 | 입력 인덱스. 0 이상의 정수여야 합니다 |
| `public_key` | string | 아니요 | 호출자가 전달한 공개 키 식별자입니다. 호환성을 위해서만 유지됩니다 |
| `address` | string | 아니요 | 호출자가 전달한 주소 식별자입니다. 호환성을 위해서만 유지됩니다 |
| `sighash_types` | number[] | 아니요 | 허용되는 sighash type 목록 |
| `disable_tweak_signer` | boolean | 아니요 | Taproot tweak signer를 비활성화할지 여부 |
| `use_tweaked_signer` | boolean | 아니요 | Taproot tweaked signer를 사용할지 여부. `disable_tweak_signer`보다 우선합니다 |

### `bitpocket_wallet_sign_ta_psbt`

Taproot Assets PSBT에 서명하고, 서명된 각 입력의 `tapKeySig`를 반환합니다.

- 입력 구조는 `bitpocket_wallet_sign_btc_psbt`와 동일합니다.
- Taproot Assets 시나리오에서는 로컬에서 finalize를 수행하지 않습니다. 서명은 항상 tweaked signer를 사용하며, 관련 매개변수는 호환성을 위해서만 유지됩니다.

### `bitpocket_wallet_sign_message`

비어 있지 않은 임의의 문자열에 대해 BTC ECDSA 메시지 서명을 생성합니다.

| 매개변수 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `message` | string | 예 | 서명할 문자열 |

출력에는 `network`, `walletAddress`, `message`, `signature` 등의 필드가 포함됩니다.

## 빠른 시작

### 환경 변수 설정

| 변수 | 설명 |
| --- | --- |
| `BTC_MNEMONIC` | 필수. BIP39 지갑 니모닉이며 로컬 메모리에서만 사용됩니다 |

> 보안 참고: `BTC_MNEMONIC`은 자산에 대한 제어권을 의미합니다. 반드시 로컬 환경 변수로만 주입하세요. 코드 저장소에 커밋하거나, 로그에 출력하거나, 온라인 서비스로 전송하지 마세요.

### for Claude Code

다음 명령으로 빠르게 설치할 수 있습니다.

```bash
claude mcp add -s user bitpocket-local-mcp \
  -e BTC_MNEMONIC="<YOUR_MNEMONIC>" \
  -- npx -y @bitdancelabs/bitpocket-local-mcp@latest
```

### for Claude Desktop / 기타 MCP 클라이언트

클라이언트가 JSON 설정을 사용하는 경우, 다음 stdio 설정을 참고하세요.

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

다음 설정을 `~/.config/opencode/opencode.json`에 추가하세요.

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

## 예시 상호작용

MCP Server가 활성화되면 Agent는 다음과 같은 자연어 요청에 응답할 수 있습니다.

```text
내 BTC 지갑 주소는 무엇인가요?

# bitpocket_wallet_get_address 호출
```

```text
다음 문자열에 서명해 주세요: hello bitpocket-bitpocket-local-mcp

# bitpocket_wallet_sign_message 호출
```

```text
이 BTC PSBT에 서명해 주세요: <base64-psbt>

# bitpocket_wallet_sign_btc_psbt 호출
```

```text
이 Taproot Assets PSBT에 서명해 주세요: <base64-psbt>

# bitpocket_wallet_sign_ta_psbt 호출
```

## 개발자

```bash
# 의존성 설치
npm install

# TypeScript 컴파일
npm run build

# 로컬 개발(watch mode)
npm run dev
```

빌드 출력은 `dist/` 디렉터리에 작성됩니다.

## License

MIT © BitDance-Labs
