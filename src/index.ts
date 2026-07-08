import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

import {
    ensureWalletFromEnv,
    signBtcPsbtFromEnv,
    signMessageFromEnv,
    signTaPsbtFromEnv
} from "./wallet/wallet-service.js";
import {
    MNEMONIC_ENV_NAME,
    SignPsbtInputOptions,
    WALLET_NETWORK_ENV_NAME,
    WALLET_STORE_PATH_ENV_NAME
} from "./wallet/types.js";
import { getDefaultWalletStorePath } from "./wallet/wallet-storage.js";

const TOOL_NAMES = {
    getAddress: "bitpocket_wallet_get_address",
    signBtcPsbt: "bitpocket_wallet_sign_btc_psbt",
    signTaPsbt: "bitpocket_wallet_sign_ta_psbt",
    signMessage: "bitpocket_wallet_sign_message"
} as const;

const server = new Server({
    name: "bitpocket-local-wallet-mcp-server",
    version: "1.0.0"
}, {
    capabilities: {
        tools: {}
    }
});

function jsonResponse(data: unknown) {
    return {
        content: [{
            type: "text" as const,
            text: JSON.stringify(data, null, 2)
        }]
    };
}

function getStringArg(
    args: Record<string, unknown> | undefined,
    key: string
): string {
    const value = args?.[key];

    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`Parameter ${key} must be a non-empty string`);
    }

    return value;
}

function getOptionalBooleanArg(
    args: Record<string, unknown> | undefined,
    key: string,
    fallback: boolean
): boolean {
    const value = args?.[key];

    if (value === undefined) {
        return fallback;
    }

    if (typeof value !== "boolean") {
        throw new Error(`Parameter ${key} must be a boolean`);
    }

    return value;
}

function getOptionalNumberArrayArg(
    args: Record<string, unknown>,
    key: string
): number[] | undefined {
    const value = args[key];

    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value) || value.some(item => typeof item !== "number" || !Number.isInteger(item))) {
        throw new Error(`Parameter ${key} must be an array of integers`);
    }

    return value;
}

function getOptionalStringField(args: Record<string, unknown>, key: string): string | undefined {
    const value = args[key];

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`Parameter ${key} must be a non-empty string`);
    }

    return value;
}

function getOptionalBooleanField(args: Record<string, unknown>, key: string): boolean | undefined {
    const value = args[key];

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== "boolean") {
        throw new Error(`Parameter ${key} must be a boolean`);
    }

    return value;
}

function getOptionalToSignInputsArg(
    args: Record<string, unknown> | undefined,
    key = "to_sign_inputs"
): SignPsbtInputOptions[] | undefined {
    const value = args?.[key];

    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value)) {
        throw new Error(`Parameter ${key} must be an array`);
    }

    return value.map((item, itemIndex) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new Error(`Parameter ${key}[${itemIndex}] must be an object`);
        }

        const itemArgs = item as Record<string, unknown>;
        const index = itemArgs.index;

        if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
            throw new Error(`Parameter ${key}[${itemIndex}].index must be a non-negative integer`);
        }

        return {
            index,
            publicKey: getOptionalStringField(itemArgs, "public_key"),
            address: getOptionalStringField(itemArgs, "address"),
            sighashTypes: getOptionalNumberArrayArg(itemArgs, "sighash_types"),
            disableTweakSigner: getOptionalBooleanField(itemArgs, "disable_tweak_signer"),
            useTweakedSigner: getOptionalBooleanField(itemArgs, "use_tweaked_signer")
        };
    });
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: TOOL_NAMES.getAddress,
                description: "Derive a BitPocket local wallet Taproot address from BTC_MNEMONIC according to NETWORK, and persist the derived public wallet information to a local JSON file.",
                inputSchema: {
                    type: "object",
                    properties: {},
                    additionalProperties: false
                },
                annotations: {
                    readOnlyHint: true,
                    destructiveHint: false,
                    idempotentHint: true,
                    openWorldHint: false
                }
            },
            {
                name: TOOL_NAMES.signBtcPsbt,
                description: "Sign a BTC PSBT with the BitPocket local wallet according to NETWORK.",
                inputSchema: {
                    type: "object",
                    properties: {
                        psbt: {
                            type: "string",
                            description: "The PSBT to be signed, base64 encoded"
                        },
                        auto_finalized: {
                            type: "boolean",
                            description: "Whether to attempt finalize after signing, default false"
                        },
                        to_sign_inputs: {
                            type: "array",
                            description: "Optional. Specifies which inputs to sign; omitting this or passing an empty array means sign all signable inputs.",
                            items: {
                                type: "object",
                                properties: {
                                    index: {
                                        type: "number",
                                        description: "The index of the input to sign"
                                    },
                                    public_key: {
                                        type: "string",
                                        description: "Public key identifier passed by the caller; kept for compatibility only and not used for local key selection"
                                    },
                                    address: {
                                        type: "string",
                                        description: "Address identifier passed by the caller; kept for compatibility only and not used for local key selection"
                                    },
                                    sighash_types: {
                                        type: "array",
                                        items: {
                                            type: "number"
                                        },
                                        description: "Allowed sighash type list"
                                    },
                                    disable_tweak_signer: {
                                        type: "boolean",
                                        description: "Whether to disable the Taproot tweak signer"
                                    },
                                    use_tweaked_signer: {
                                        type: "boolean",
                                        description: "Whether to use the Taproot tweaked signer; takes precedence over disable_tweak_signer"
                                    }
                                },
                                required: ["index"],
                                additionalProperties: false
                            }
                        }
                    },
                    required: ["psbt"],
                    additionalProperties: false
                },
                annotations: {
                    readOnlyHint: false,
                    destructiveHint: false,
                    idempotentHint: true,
                    openWorldHint: false
                }
            },
            {
                name: TOOL_NAMES.signTaPsbt,
                description: "Sign a Taproot Assets PSBT with the BitPocket local wallet according to NETWORK, returning the tapKeySig for each signed input.",
                inputSchema: {
                    type: "object",
                    properties: {
                        psbt: {
                            type: "string",
                            description: "The Taproot Assets PSBT to be signed, base64 encoded"
                        },
                        auto_finalized: {
                            type: "boolean",
                            description: "Compatibility parameter. Taproot Assets PSBT signing is not finalized locally."
                        },
                        to_sign_inputs: {
                            type: "array",
                            description: "Optional. Specifies which inputs to sign; omitting this or passing an empty array means sign all signable inputs.",
                            items: {
                                type: "object",
                                properties: {
                                    index: {
                                        type: "number",
                                        description: "The index of the input to sign"
                                    },
                                    public_key: {
                                        type: "string",
                                        description: "Public key identifier passed by the caller; kept for compatibility only and not used for local key selection"
                                    },
                                    address: {
                                        type: "string",
                                        description: "Address identifier passed by the caller; kept for compatibility only and not used for local key selection"
                                    },
                                    sighash_types: {
                                        type: "array",
                                        items: {
                                            type: "number"
                                        },
                                        description: "Compatibility parameter. Taproot Assets signing prefers the sighashType carried by the PSBT input."
                                    },
                                    disable_tweak_signer: {
                                        type: "boolean",
                                        description: "Compatibility parameter. Taproot Assets signing always uses the tweaked signer."
                                    },
                                    use_tweaked_signer: {
                                        type: "boolean",
                                        description: "Compatibility parameter. Taproot Assets signing always uses the tweaked signer."
                                    }
                                },
                                required: ["index"],
                                additionalProperties: false
                            }
                        }
                    },
                    required: ["psbt"],
                    additionalProperties: false
                },
                annotations: {
                    readOnlyHint: false,
                    destructiveHint: false,
                    idempotentHint: true,
                    openWorldHint: false
                }
            },
            {
                name: TOOL_NAMES.signMessage,
                description: "Generate a BTC ECDSA message signature for the given string using the BitPocket local wallet.",
                inputSchema: {
                    type: "object",
                    properties: {
                        message: {
                            type: "string",
                            description: "The string to be signed"
                        }
                    },
                    required: ["message"],
                    additionalProperties: false
                },
                annotations: {
                    readOnlyHint: false,
                    destructiveHint: false,
                    idempotentHint: true,
                    openWorldHint: false
                }
            }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === TOOL_NAMES.getAddress) {
        const wallet = await ensureWalletFromEnv();

        return jsonResponse({
            ok: true,
            wallet,
            storage: {
                walletStorePath: getDefaultWalletStorePath(),
                walletStorePathEnv: WALLET_STORE_PATH_ENV_NAME
            },
            signer: {
                mnemonicEnv: MNEMONIC_ENV_NAME,
                networkEnv: WALLET_NETWORK_ENV_NAME,
                networkConfigured: wallet.network,
                mnemonicConfigured: true
            }
        });
    }

    if (name === TOOL_NAMES.signBtcPsbt) {
        const psbt = getStringArg(args, "psbt");
        const autoFinalized = getOptionalBooleanArg(args, "auto_finalized", false);
        const toSignInputs = getOptionalToSignInputsArg(args);
        const signed = await signBtcPsbtFromEnv(psbt, {
            autoFinalized,
            toSignInputs
        });

        return jsonResponse({
            ok: true,
            ...signed
        });
    }

    if (name === TOOL_NAMES.signTaPsbt) {
        const psbt = getStringArg(args, "psbt");
        const autoFinalized = getOptionalBooleanArg(args, "auto_finalized", false);
        const toSignInputs = getOptionalToSignInputsArg(args);
        const signed = await signTaPsbtFromEnv(psbt, {
            autoFinalized,
            toSignInputs
        });

        return jsonResponse({
            ok: true,
            ...signed
        });
    }

    if (name === TOOL_NAMES.signMessage) {
        const message = getStringArg(args, "message");
        const wallet = await ensureWalletFromEnv();
        const signature = signMessageFromEnv(message);

        return jsonResponse({
            ok: true,
            network: wallet.network,
            walletAddress: wallet.address,
            message,
            signature,
            signatureEncoding: "base64"
        });
    }

    throw new Error(`Tool not found: ${name}`);
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("BitPocket local wallet MCP server started on stdio");
}

main().catch((error: unknown) => {
    console.error("BitPocket local wallet MCP server failed to start:", error);
    process.exit(1);
});
