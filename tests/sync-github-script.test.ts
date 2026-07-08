import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return false;
        }

        throw error;
    }
}

test("sync-github script uses rsync and requires a prepared target repository", async () => {
    const script = await readFile(join(process.cwd(), "scripts", "sync-github.sh"), "utf8");

    assert.match(script, /rsync/);
    assert.match(script, /\.\.\/\.\.\/github\/bitpocket-local-mcp/);
    assert.match(script, /\[\s*!\s*-d\s+"\$target_dir"\s*\]/);
    assert.doesNotMatch(script, /mkdir\s+-p\s+"\$target_dir"/);
    assert.doesNotMatch(script, /--delete-excluded/);
    assert.match(script, /--exclude='\*\.sh'/);
});

test("sync-github script preserves target .git and excludes ignored files", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "bitpocket-github-sync-"));

    try {
        await mkdir(join(targetDir, ".git"), { recursive: true });
        await mkdir(join(targetDir, "stale"), { recursive: true });
        await writeFile(join(targetDir, ".git", "config"), "github repo config\n");
        await writeFile(join(targetDir, "stale", "old.txt"), "old\n");
        await writeFile(join(targetDir, "publish.sh"), "old shell script\n");

        await execFileAsync("bash", ["scripts/sync-github.sh"], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                BITPOCKET_GITHUB_SYNC_TARGET: targetDir
            }
        });

        assert.equal(await exists(join(targetDir, ".git", "config")), true);
        assert.equal(await exists(join(targetDir, "stale", "old.txt")), false);
        assert.equal(await exists(join(targetDir, "dist", "index.js")), false);
        assert.equal(await exists(join(targetDir, "publish.sh")), true);
        assert.equal(await exists(join(targetDir, "README.md")), true);
    } finally {
        await rm(targetDir, { recursive: true, force: true });
    }
});
