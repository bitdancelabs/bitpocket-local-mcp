import * as ecc from "tiny-secp256k1";
import { crypto, initEccLib, networks, payments, Psbt, Signer } from "bitcoinjs-lib";
import * as bip39 from "bip39";
import BIP32Factory from "bip32";
import { ECPairFactory } from "ecpair";
import * as bitcoinMessage from "bitcoinjs-message";
import { Buffer } from "buffer";

import { BitPocketWalletInfo, BitPocketWalletNetwork, SignPsbtInputOptions, WALLET_NETWORKS } from "./types.js";

initEccLib(ecc);

const bip32 = BIP32Factory(ecc);
const ecpair = ECPairFactory(ecc);
type PrivateKeySigner = Signer & { privateKey?: Buffer };
type BitcoinNetwork = typeof networks.bitcoin;

const DEFAULT_NETWORK: BitPocketWalletNetwork = "mainnet";
const NETWORK_CONFIGS: Record<BitPocketWalletNetwork, { bitcoinNetwork: BitcoinNetwork; coinType: "0" | "1" }> = {
    mainnet: {
        bitcoinNetwork: networks.bitcoin,
        coinType: "0"
    },
    testnet: {
        bitcoinNetwork: networks.testnet,
        coinType: "1"
    },
    regtest: {
        bitcoinNetwork: networks.regtest,
        coinType: "1"
    }
};

function resolveWalletNetwork(network: unknown = DEFAULT_NETWORK): {
    name: BitPocketWalletNetwork;
    bitcoinNetwork: BitcoinNetwork;
    coinType: "0" | "1";
    accountPublicKeyPath: string;
    assetPublicKeyPath: string;
    walletDerivationPath: string;
} {
    if (typeof network !== "string" || !WALLET_NETWORKS.includes(network as BitPocketWalletNetwork)) {
        throw new Error(`network must be one of: ${WALLET_NETWORKS.join(", ")}`);
    }

    const name = network as BitPocketWalletNetwork;
    const config = NETWORK_CONFIGS[name];
    const accountPublicKeyPath = `m/86'/${config.coinType}'/0'`;
    const assetPublicKeyPath = `m/1017'/${config.coinType}'/212'`;

    return {
        name,
        bitcoinNetwork: config.bitcoinNetwork,
        coinType: config.coinType,
        accountPublicKeyPath,
        assetPublicKeyPath,
        walletDerivationPath: `${accountPublicKeyPath}/0/0`
    };
}

function toXOnly(publicKey: Buffer): Buffer {
    return publicKey.slice(1, 33);
}

function tapTweakHash(publicKey: Buffer, tweakHash?: Buffer): Buffer {
    return crypto.taggedHash(
        "TapTweak",
        Buffer.concat(tweakHash ? [publicKey, tweakHash] : [publicKey])
    );
}

export function tweakSigner(
    signer: Signer,
    opts: { tweakHash?: Buffer; network?: BitcoinNetwork } = {}
): Signer {
    let privateKey = (signer as PrivateKeySigner).privateKey;

    if (!privateKey) {
        throw new Error("Private key is required for tweaking signer.");
    }

    if (signer.publicKey[0] === 3) {
        privateKey = Buffer.from(ecc.privateNegate(privateKey));
    }

    const tweakedPrivateKey = ecc.privateAdd(
        privateKey,
        tapTweakHash(toXOnly(Buffer.from(signer.publicKey)), opts.tweakHash)
    );

    if (!tweakedPrivateKey) {
        throw new Error("Invalid tweaked private key.");
    }

    return ecpair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
        network: opts.network ?? networks.bitcoin
    });
}

export function deriveWalletFromMnemonic(
    mnemonic: string,
    network: BitPocketWalletNetwork = DEFAULT_NETWORK
): BitPocketWalletInfo {
    const walletNetwork = resolveWalletNetwork(network);
    const normalizedMnemonic = mnemonic.trim().replace(/\s+/g, " ");

    if (!bip39.validateMnemonic(normalizedMnemonic)) {
        throw new Error("BTC_MNEMONIC invalid, please check your mnemonic.");
    }

    const seed = bip39.mnemonicToSeedSync(normalizedMnemonic);
    const root = bip32.fromSeed(seed, walletNetwork.bitcoinNetwork);
    const fingerprint = root.fingerprint.toString("hex");
    const accountNode = root.derivePath(walletNetwork.accountPublicKeyPath);
    const assetNode = root.derivePath(walletNetwork.assetPublicKeyPath);
    const walletNode = root.derivePath(walletNetwork.walletDerivationPath);

    if (!walletNode.privateKey) {
        throw new Error("Unable to derive wallet private key from BTC_MNEMONIC.");
    }

    const internalSigner = ecpair.fromPrivateKey(walletNode.privateKey, {
        network: walletNetwork.bitcoinNetwork
    });
    const tweakedSigner = tweakSigner(internalSigner, {
        network: walletNetwork.bitcoinNetwork
    });
    const xOnlyPublicKey = toXOnly(Buffer.from(tweakedSigner.publicKey));
    const p2tr = payments.p2tr({
        pubkey: xOnlyPublicKey,
        network: walletNetwork.bitcoinNetwork
    });

    if (!p2tr.address) {
        throw new Error("Unable to derive Taproot address from BTC_MNEMONIC.");
    }

    const now = new Date().toISOString();

    return {
        schemaVersion: 1,
        network: walletNetwork.name,
        addressType: "taproot",
        address: p2tr.address,
        publicKey: Buffer.from(internalSigner.publicKey).toString("hex"),
        xOnlyPublicKey: xOnlyPublicKey.toString("hex"),
        fingerprint,
        accountPublicKey: accountNode.neutered().toBase58(),
        assetPublicKey: assetNode.neutered().toBase58(),
        accountPublicKeyPath: walletNetwork.accountPublicKeyPath,
        assetPublicKeyPath: walletNetwork.assetPublicKeyPath,
        derivationPath: walletNetwork.walletDerivationPath,
        mnemonicStored: false,
        createdAt: now,
        updatedAt: now
    };
}

export function signMessageWithMnemonic(
    mnemonic: string,
    message: string,
    network: BitPocketWalletNetwork = DEFAULT_NETWORK
): string {
    const walletNetwork = resolveWalletNetwork(network);
    const normalizedMnemonic = mnemonic.trim().replace(/\s+/g, " ");

    if (!bip39.validateMnemonic(normalizedMnemonic)) {
        throw new Error("BTC_MNEMONIC is not a valid BIP39 mnemonic.");
    }

    const seed = bip39.mnemonicToSeedSync(normalizedMnemonic);
    const root = bip32.fromSeed(seed, walletNetwork.bitcoinNetwork);
    const walletNode = root.derivePath(walletNetwork.walletDerivationPath);

    if (!walletNode.privateKey) {
        throw new Error("Unable to derive wallet private key from BTC_MNEMONIC.");
    }

    const keyPair = ecpair.fromPrivateKey(walletNode.privateKey, {
        network: walletNetwork.bitcoinNetwork
    });
    const signature = bitcoinMessage.sign(message, keyPair.privateKey!, keyPair.compressed);

    return signature.toString("base64");
}

function normalizeDerivationPath(path: string, network: ReturnType<typeof resolveWalletNetwork>): string {
    if (network.name === "mainnet") {
        return path;
    }

    if (path.startsWith("m/84'/0'")) {
        return path.replace("m/84'/0'", "m/84'/1'");
    }

    if (path.startsWith("m/86'/0'")) {
        return path.replace("m/86'/0'", "m/86'/1'");
    }

    return path;
}

function getInputDerivationPath(
    input: Psbt["data"]["inputs"][number],
    network: ReturnType<typeof resolveWalletNetwork>
): string {
    const inputWithDerivations = input as {
        tapBip32Derivation?: Array<{ path?: string }>;
        bip32Derivation?: Array<{ path?: string }>;
    };
    const path = inputWithDerivations.tapBip32Derivation?.[0]?.path
        ?? inputWithDerivations.bip32Derivation?.[0]?.path
        ?? network.walletDerivationPath;

    return normalizeDerivationPath(path, network);
}

function getTaprootAssetDerivationPath(
    input: Psbt["data"]["inputs"][number],
    network: ReturnType<typeof resolveWalletNetwork>
): string {
    const inputWithDerivations = input as {
        tapBip32Derivation?: Array<{ path?: string }>;
    };
    const path = inputWithDerivations.tapBip32Derivation?.[0]?.path
        ?? `${network.assetPublicKeyPath}/0/0`;

    return normalizeDerivationPath(path, network);
}

function getSigningKeyPair(
    mnemonic: string,
    path: string,
    network: ReturnType<typeof resolveWalletNetwork>,
    useTweakedSigner: boolean,
    tweakHash?: Buffer
): Signer {
    const normalizedMnemonic = mnemonic.trim().replace(/\s+/g, " ");

    if (!bip39.validateMnemonic(normalizedMnemonic)) {
        throw new Error("BTC_MNEMONIC is not a valid BIP39 mnemonic.");
    }

    const seed = bip39.mnemonicToSeedSync(normalizedMnemonic);
    const root = bip32.fromSeed(seed, network.bitcoinNetwork);
    const node = root.derivePath(path);

    if (!node.privateKey) {
        throw new Error(`Unable to derive private key from BTC_MNEMONIC at path ${path}.`);
    }

    const keyPair = ecpair.fromPrivateKey(node.privateKey, {
        network: network.bitcoinNetwork
    });

    if (!useTweakedSigner) {
        return keyPair;
    }

    return tweakSigner(keyPair, {
        network: network.bitcoinNetwork,
        tweakHash
    });
}

function shouldUseTweakedSigner(optItem: SignPsbtInputOptions | undefined): boolean {
    if (!optItem) {
        return true;
    }

    if (optItem.useTweakedSigner !== undefined) {
        return optItem.useTweakedSigner;
    }

    if (optItem.disableTweakSigner !== undefined) {
        return !optItem.disableTweakSigner;
    }

    return true;
}

export function signBtcPsbtWithMnemonic(
    mnemonic: string,
    psbtBase64: string,
    options: {
        autoFinalized?: boolean;
        network?: BitPocketWalletNetwork;
        toSignInputs?: SignPsbtInputOptions[];
    } = {}
): { signedPsbt: string; finalized: boolean; txHex: string | null } {
    const walletNetwork = resolveWalletNetwork(options.network);
    const psbt = Psbt.fromBase64(psbtBase64, {
        network: walletNetwork.bitcoinNetwork
    });
    const toSignInputs = options.toSignInputs ?? [];
    const signAllInputs = toSignInputs.length === 0;

    for (let i = 0; i < psbt.data.inputs.length; i++) {
        const input = psbt.data.inputs[i];

        if (input.tapKeySig) {
            continue;
        }

        const optItem = toSignInputs.find(item => item.index === i);

        if (!signAllInputs && !optItem) {
            continue;
        }

        const path = getInputDerivationPath(input, walletNetwork);
        const isTaprootAssetsKey = path.startsWith("m/1017'");
        const signer = getSigningKeyPair(
            mnemonic,
            path,
            walletNetwork,
            shouldUseTweakedSigner(optItem),
            isTaprootAssetsKey ? input.tapMerkleRoot : undefined
        );
        const sighashTypes = optItem?.sighashTypes ?? (input.sighashType ? [input.sighashType] : undefined);

        if (!input.tapInternalKey) {
            const tapDerivation = input.tapBip32Derivation?.[0];
            input.tapInternalKey = tapDerivation?.pubkey ?? toXOnly(Buffer.from(signer.publicKey));
        }

        psbt.signInput(i, signer, sighashTypes);
    }

    if (options.autoFinalized) {
        psbt.finalizeAllInputs();

        return {
            signedPsbt: psbt.toBase64(),
            finalized: true,
            txHex: psbt.extractTransaction().toHex()
        };
    }

    return {
        signedPsbt: psbt.toBase64(),
        finalized: false,
        txHex: null
    };
}

export function signTaprootAssetPsbtWithMnemonic(
    mnemonic: string,
    psbtBase64: string,
    options: {
        network?: BitPocketWalletNetwork;
        toSignInputs?: SignPsbtInputOptions[];
    } = {}
): { signedPsbt: string; finalized: boolean; signatures: string[] } {
    const walletNetwork = resolveWalletNetwork(options.network);
    const psbt = Psbt.fromBase64(psbtBase64, {
        network: walletNetwork.bitcoinNetwork
    });
    const toSignInputs = options.toSignInputs ?? [];
    const signAllInputs = toSignInputs.length === 0;
    const signatures: string[] = [];

    for (let i = 0; i < psbt.data.inputs.length; i++) {
        const input = psbt.data.inputs[i];

        if (input.tapKeySig) {
            signatures.push(input.tapKeySig.toString("hex"));
            continue;
        }

        const optItem = toSignInputs.find(item => item.index === i);

        if (!signAllInputs && !optItem) {
            continue;
        }

        const path = getTaprootAssetDerivationPath(input, walletNetwork);
        const signer = getSigningKeyPair(
            mnemonic,
            path,
            walletNetwork,
            true
        );
        const sighashTypes = input.sighashType ? [input.sighashType] : undefined;

        if (!input.tapInternalKey) {
            const tapDerivation = input.tapBip32Derivation?.[0];
            input.tapInternalKey = tapDerivation?.pubkey ?? toXOnly(Buffer.from(signer.publicKey));
        }

        psbt.signInput(i, signer, sighashTypes);

        const signature = psbt.data.inputs[i].tapKeySig;

        if (!signature) {
            throw new Error(`Unable to sign Taproot Assets PSBT input ${i}.`);
        }

        signatures.push(signature.toString("hex"));
    }

    return {
        signedPsbt: psbt.toBase64(),
        finalized: false,
        signatures
    };
}
