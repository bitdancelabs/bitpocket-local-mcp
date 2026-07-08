import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("does not expose the mnemonic-reading MCP tool", async () => {
    const indexSource = await readFile(join(process.cwd(), "src", "index.ts"), "utf8");

    assert.doesNotMatch(indexSource, /bitpocket_wallet_get_mnemonic/);
});
