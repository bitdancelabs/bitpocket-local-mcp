import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import * as ecc from "tiny-secp256k1";
import { initEccLib, networks, payments, Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import * as bip39 from "bip39";
import BIP32Factory from "bip32";
import { ECPairFactory } from "ecpair";

import {
    ensureWalletFromEnv,
    ensureWalletFromMnemonic,
    signBtcPsbtFromEnv,
    signTaPsbtFromEnv
} from "../src/wallet/wallet-service.js";
import { tweakSigner } from "../src/wallet/wallet-core.js";
import { MNEMONIC_ENV_NAME, WALLET_NETWORK_ENV_NAME } from "../src/wallet/types.js";

initEccLib(ecc);

const bip32 = BIP32Factory(ecc);
const ecpair = ECPairFactory(ecc);
const TEST_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const TEST_MAINNET_RECEIVE_ADDRESS = "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr";
const TEST_MAINNET_TA_DERIVATION_PATH = "m/1017'/0'/212'/0/0";

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) {
        delete process.env[name];
    } else {
        process.env[name] = value;
    }
}

function createTaprootPsbtForWallet(address: string): string {
    const payment = payments.p2tr({
        address,
        network: networks.bitcoin
    });

    if (!payment.output) {
        throw new Error("Unable to create Taproot payment output.");
    }

    const psbt = new Psbt({
        network: networks.bitcoin
    });

    psbt.addInput({
        hash: Buffer.alloc(32, 1),
        index: 0,
        witnessUtxo: {
            script: payment.output,
            value: 10000
        }
    });
    psbt.addOutput({
        address,
        value: 9000
    });

    return psbt.toBase64();
}

function toXOnly(publicKey: Buffer): Buffer {
    return publicKey.slice(1, 33);
}

function createTaprootAssetPsbtForWallet(): string {
    const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
    const root = bip32.fromSeed(seed, networks.bitcoin);
    const node = root.derivePath(TEST_MAINNET_TA_DERIVATION_PATH);

    if (!node.privateKey) {
        throw new Error("Unable to derive test Taproot Assets private key.");
    }

    const internalSigner = ecpair.fromPrivateKey(node.privateKey, {
        network: networks.bitcoin
    });
    const tweakedSigner = tweakSigner(internalSigner, {
        network: networks.bitcoin
    });
    const payment = payments.p2tr({
        pubkey: toXOnly(Buffer.from(tweakedSigner.publicKey)),
        network: networks.bitcoin
    });

    if (!payment.output || !payment.address) {
        throw new Error("Unable to create Taproot Assets payment output.");
    }

    const psbt = new Psbt({
        network: networks.bitcoin
    });

    psbt.addInput({
        hash: Buffer.alloc(32, 2),
        index: 0,
        witnessUtxo: {
            script: payment.output,
            value: 10000
        },
        tapInternalKey: toXOnly(Buffer.from(internalSigner.publicKey)),
        tapBip32Derivation: [{
            masterFingerprint: root.fingerprint,
            path: TEST_MAINNET_TA_DERIVATION_PATH,
            pubkey: toXOnly(Buffer.from(internalSigner.publicKey)),
            leafHashes: []
        }]
    });
    psbt.addOutput({
        address: payment.address,
        value: 9000
    });

    return psbt.toBase64();
}

test("derives the mainnet wallet from mnemonic and persists public wallet data", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bitpocket-wallet-test-"));
    const walletFile = join(dir, "wallet.json");

    try {
        const wallet = await ensureWalletFromMnemonic(TEST_MNEMONIC, {
            walletStorePath: walletFile
        });

        assert.equal(wallet.network, "mainnet");
        assert.equal(wallet.addressType, "taproot");
        assert.equal(wallet.address, "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr");
        assert.equal(wallet.accountPublicKeyPath, "m/86'/0'/0'");
        assert.equal(wallet.assetPublicKeyPath, "m/1017'/0'/212'");
        assert.equal(wallet.derivationPath, "m/86'/0'/0'/0/0");
        assert.ok(wallet.accountPublicKey.startsWith("xpub"));
        assert.ok(wallet.assetPublicKey.startsWith("xpub"));
        assert.match(wallet.fingerprint, /^[0-9a-f]{8}$/);

        const saved = JSON.parse(await readFile(walletFile, "utf8"));
        assert.equal(saved.address, wallet.address);
        assert.equal(saved.mnemonicStored, false);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("defaults to mainnet when wallet network is not provided", async () => {
    const wallet = await ensureWalletFromMnemonic(TEST_MNEMONIC);

    assert.equal(wallet.network, "mainnet");
    assert.equal(wallet.address, "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr");
});

test("derives testnet and regtest wallets when network is provided", async () => {
    const testnetWallet = await ensureWalletFromMnemonic(TEST_MNEMONIC, {
        network: "testnet"
    });
    const regtestWallet = await ensureWalletFromMnemonic(TEST_MNEMONIC, {
        network: "regtest"
    });

    assert.equal(testnetWallet.network, "testnet");
    assert.match(testnetWallet.address, /^tb1p/);
    assert.ok(testnetWallet.accountPublicKey.startsWith("tpub"));

    assert.equal(regtestWallet.network, "regtest");
    assert.match(regtestWallet.address, /^bcrt1p/);
    assert.ok(regtestWallet.accountPublicKey.startsWith("tpub"));
});

test("rejects unsupported wallet networks", async () => {
    await assert.rejects(
        () => ensureWalletFromMnemonic(TEST_MNEMONIC, {
            network: "signet" as never
        }),
        /network must be one of: mainnet, testnet, regtest/
    );
});

test("derives wallet network from environment when configured", async () => {
    const originalMnemonic = process.env[MNEMONIC_ENV_NAME];
    const originalNetwork = process.env[WALLET_NETWORK_ENV_NAME];
    const dir = await mkdtemp(join(tmpdir(), "bitpocket-wallet-test-"));
    const walletFile = join(dir, "wallet.json");

    try {
        process.env[MNEMONIC_ENV_NAME] = TEST_MNEMONIC;
        process.env[WALLET_NETWORK_ENV_NAME] = "regtest";

        const wallet = await ensureWalletFromEnv({
            walletStorePath: walletFile
        });

        assert.equal(wallet.network, "regtest");
        assert.match(wallet.address, /^bcrt1p/);
    } finally {
        restoreEnv(MNEMONIC_ENV_NAME, originalMnemonic);
        restoreEnv(WALLET_NETWORK_ENV_NAME, originalNetwork);

        await rm(dir, { recursive: true, force: true });
    }
});

test("rejects unsupported wallet network from environment", async () => {
    const originalMnemonic = process.env[MNEMONIC_ENV_NAME];
    const originalNetwork = process.env[WALLET_NETWORK_ENV_NAME];

    try {
        process.env[MNEMONIC_ENV_NAME] = TEST_MNEMONIC;
        process.env[WALLET_NETWORK_ENV_NAME] = "signet";

        await assert.rejects(
            () => ensureWalletFromEnv(),
            {
                message: /^NETWORK must be one of: mainnet, testnet, regtest$/
            }
        );
    } finally {
        restoreEnv(MNEMONIC_ENV_NAME, originalMnemonic);
        restoreEnv(WALLET_NETWORK_ENV_NAME, originalNetwork);
    }
});

test("signs a Taproot BTC PSBT with the wallet key from environment", async () => {
    const originalMnemonic = process.env[MNEMONIC_ENV_NAME];
    const originalNetwork = process.env[WALLET_NETWORK_ENV_NAME];
    const psbtBase64 = createTaprootPsbtForWallet(TEST_MAINNET_RECEIVE_ADDRESS);

    try {
        process.env[MNEMONIC_ENV_NAME] = TEST_MNEMONIC;
        process.env[WALLET_NETWORK_ENV_NAME] = "mainnet";

        const result = await signBtcPsbtFromEnv(psbtBase64);
        const signedPsbt = Psbt.fromBase64(result.signedPsbt);

        assert.equal(result.finalized, false);
        assert.equal(result.txHex, null);
        assert.notEqual(result.signedPsbt, psbtBase64);
        assert.ok(signedPsbt.data.inputs[0].tapKeySig);
    } finally {
        restoreEnv(MNEMONIC_ENV_NAME, originalMnemonic);
        restoreEnv(WALLET_NETWORK_ENV_NAME, originalNetwork);
    }
});

test("finalizes a signed Taproot BTC PSBT when requested", async () => {
    const originalMnemonic = process.env[MNEMONIC_ENV_NAME];
    const originalNetwork = process.env[WALLET_NETWORK_ENV_NAME];
    const psbtBase64 = createTaprootPsbtForWallet(TEST_MAINNET_RECEIVE_ADDRESS);

    try {
        process.env[MNEMONIC_ENV_NAME] = TEST_MNEMONIC;
        process.env[WALLET_NETWORK_ENV_NAME] = "mainnet";

        const result = await signBtcPsbtFromEnv(psbtBase64, {
            autoFinalized: true
        });

        assert.equal(result.finalized, true);
        assert.match(result.txHex, /^[0-9a-f]+$/);
    } finally {
        restoreEnv(MNEMONIC_ENV_NAME, originalMnemonic);
        restoreEnv(WALLET_NETWORK_ENV_NAME, originalNetwork);
    }
});

test("skips BTC PSBT inputs that are not listed in toSignInputs", async () => {
    const originalMnemonic = process.env[MNEMONIC_ENV_NAME];
    const originalNetwork = process.env[WALLET_NETWORK_ENV_NAME];
    const psbtBase64 = createTaprootPsbtForWallet(TEST_MAINNET_RECEIVE_ADDRESS);

    try {
        process.env[MNEMONIC_ENV_NAME] = TEST_MNEMONIC;
        process.env[WALLET_NETWORK_ENV_NAME] = "mainnet";

        const result = await signBtcPsbtFromEnv(psbtBase64, {
            toSignInputs: [{
                index: 1
            }]
        });
        const signedPsbt = Psbt.fromBase64(result.signedPsbt);

        assert.equal(result.signedPsbt, psbtBase64);
        assert.equal(signedPsbt.data.inputs[0].tapKeySig, undefined);
    } finally {
        restoreEnv(MNEMONIC_ENV_NAME, originalMnemonic);
        restoreEnv(WALLET_NETWORK_ENV_NAME, originalNetwork);
    }
});

test("signs a Taproot Assets PSBT with the derivation path from tapBip32Derivation", async () => {
    const originalMnemonic = process.env[MNEMONIC_ENV_NAME];
    const originalNetwork = process.env[WALLET_NETWORK_ENV_NAME];
    const psbtBase64 = createTaprootAssetPsbtForWallet();

    try {
        process.env[MNEMONIC_ENV_NAME] = TEST_MNEMONIC;
        process.env[WALLET_NETWORK_ENV_NAME] = "mainnet";

        const result = await signTaPsbtFromEnv(psbtBase64);
        const signedPsbt = Psbt.fromBase64(result.signedPsbt);

        assert.equal(result.finalized, false);
        assert.equal(result.signatures.length, 1);
        assert.match(result.signatures[0], /^[0-9a-f]+$/);
        assert.equal(result.signatures[0], signedPsbt.data.inputs[0].tapKeySig?.toString("hex"));
    } finally {
        restoreEnv(MNEMONIC_ENV_NAME, originalMnemonic);
        restoreEnv(WALLET_NETWORK_ENV_NAME, originalNetwork);
    }
});
