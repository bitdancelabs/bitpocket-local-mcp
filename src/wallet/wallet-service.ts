import { Psbt } from "bitcoinjs-lib";

import {
    deriveWalletFromMnemonic,
    signBtcPsbtWithMnemonic,
    signMessageWithMnemonic,
    signTaprootAssetPsbtWithMnemonic
} from "./wallet-core.js";
import { writeWallet } from "./wallet-storage.js";
import {
    MNEMONIC_ENV_NAME,
    BitPocketWalletInfo,
    BitPocketWalletNetwork,
    SignPsbtOptions,
    WalletServiceOptions,
    WALLET_NETWORK_ENV_NAME,
    WALLET_NETWORKS
} from "./types.js";

const DEFAULT_NETWORK: BitPocketWalletNetwork = "mainnet";

export function getMnemonicFromEnv(): string {
    const mnemonic = process.env[MNEMONIC_ENV_NAME]?.trim();

    if (!mnemonic) {
        throw new Error(`Missing ${MNEMONIC_ENV_NAME}. Configure the wallet mnemonic in the MCP server env.`);
    }

    return mnemonic;
}

export function getWalletNetworkFromEnv(): BitPocketWalletNetwork {
    const network = process.env[WALLET_NETWORK_ENV_NAME]?.trim();

    if (!network) {
        return DEFAULT_NETWORK;
    }

    if (!WALLET_NETWORKS.includes(network as BitPocketWalletNetwork)) {
        throw new Error(`${WALLET_NETWORK_ENV_NAME} must be one of: ${WALLET_NETWORKS.join(", ")}`);
    }

    return network as BitPocketWalletNetwork;
}

export async function ensureWalletFromMnemonic(
    mnemonic: string,
    options: WalletServiceOptions = {}
): Promise<BitPocketWalletInfo> {
    const wallet = deriveWalletFromMnemonic(mnemonic, options.network);
    return writeWallet(wallet, options.walletStorePath);
}

export async function ensureWalletFromEnv(options: WalletServiceOptions = {}): Promise<BitPocketWalletInfo> {
    return ensureWalletFromMnemonic(getMnemonicFromEnv(), {
        ...options,
        network: options.network ?? getWalletNetworkFromEnv()
    });
}

export function signMessageFromEnv(message: string, options: WalletServiceOptions = {}): string {
    return signMessageWithMnemonic(getMnemonicFromEnv(), message, options.network ?? getWalletNetworkFromEnv());
}

export async function signBtcPsbtFromEnv(
    psbtBase64: string,
    options: SignPsbtOptions = {}
): Promise<{ signedPsbt: string; finalized: boolean; txHex: string | null }> {
    const network = options.network ?? getWalletNetworkFromEnv();
    await ensureWalletFromEnv({ network });

    return signBtcPsbtWithMnemonic(getMnemonicFromEnv(), psbtBase64, {
        autoFinalized: options.autoFinalized,
        network,
        toSignInputs: options.toSignInputs
    });
}

export async function signTaPsbtFromEnv(
    psbtBase64: string,
    options: SignPsbtOptions = {}
): Promise<{ signedPsbt: string; finalized: boolean; signatures: string[] }> {
    const network = options.network ?? getWalletNetworkFromEnv();

    Psbt.fromBase64(psbtBase64);
    await ensureWalletFromEnv({
        network
    });

    return signTaprootAssetPsbtWithMnemonic(getMnemonicFromEnv(), psbtBase64, {
        network,
        toSignInputs: options.toSignInputs
    });
}
