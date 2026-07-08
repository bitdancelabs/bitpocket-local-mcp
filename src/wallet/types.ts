export const MNEMONIC_ENV_NAME = "BTC_MNEMONIC";
export const WALLET_NETWORK_ENV_NAME = "NETWORK";
export const WALLET_STORE_PATH_ENV_NAME = "BITPOCKET_WALLET_STORE_PATH";
export const WALLET_NETWORKS = ["mainnet", "testnet", "regtest"] as const;

export type BitPocketWalletNetwork = typeof WALLET_NETWORKS[number];

export interface BitPocketWalletInfo {
    schemaVersion: 1;
    network: BitPocketWalletNetwork;
    addressType: "taproot";
    address: string;
    publicKey: string;
    xOnlyPublicKey: string;
    fingerprint: string;
    accountPublicKey: string;
    assetPublicKey: string;
    accountPublicKeyPath: string;
    assetPublicKeyPath: string;
    derivationPath: string;
    mnemonicStored: false;
    createdAt: string;
    updatedAt: string;
}

export interface WalletServiceOptions {
    walletStorePath?: string;
    network?: BitPocketWalletNetwork;
}

export interface SignPsbtOptions {
    autoFinalized?: boolean;
    network?: BitPocketWalletNetwork;
    toSignInputs?: SignPsbtInputOptions[];
}

export interface SignPsbtInputOptions {
    index: number;
    publicKey?: string;
    address?: string;
    sighashTypes?: number[];
    disableTweakSigner?: boolean;
    useTweakedSigner?: boolean;
}
