import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { BitPocketWalletInfo, WALLET_STORE_PATH_ENV_NAME } from "./types.js";

export function getDefaultWalletStorePath(): string {
    return process.env[WALLET_STORE_PATH_ENV_NAME]
        || join(homedir(), ".bitpocket", "local-wallet-mcp", "wallet.json");
}

export async function readWallet(storePath = getDefaultWalletStorePath()): Promise<BitPocketWalletInfo | null> {
    try {
        const raw = await readFile(storePath, "utf8");
        return JSON.parse(raw) as BitPocketWalletInfo;
    } catch (error: unknown) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            return null;
        }

        throw error;
    }
}

export async function writeWallet(
    wallet: BitPocketWalletInfo,
    storePath = getDefaultWalletStorePath()
): Promise<BitPocketWalletInfo> {
    const existing = await readWallet(storePath);
    const nextWallet: BitPocketWalletInfo = {
        ...wallet,
        createdAt: existing?.address === wallet.address ? existing.createdAt : wallet.createdAt,
        updatedAt: new Date().toISOString(),
        mnemonicStored: false
    };

    await mkdir(dirname(storePath), { recursive: true });
    await writeFile(storePath, `${JSON.stringify(nextWallet, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600
    });

    return nextWallet;
}
