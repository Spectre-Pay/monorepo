import { execSync, type ExecSyncOptions } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { platform } from "node:os";

// ==========================================================================
// Attestation Workflow Test Script
// Simulates the CRE Attestation workflow using the cre CLI
// ==========================================================================

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ATTESTATION_DIR = resolve(PROJECT_ROOT, "Attestation");
const IS_WSL = platform() === "linux" && existsSync("/proc/version") &&
  execSync("cat /proc/version", { encoding: "utf-8" }).toLowerCase().includes("microsoft");

// Convert a WSL/Unix path to a Windows path for cmd.exe
function toWinPath(p: string): string {
  if (!IS_WSL) return p;
  return execSync(`wslpath -w "${p}"`, { encoding: "utf-8" }).trim();
}

// Run a command, routing cre calls through cmd.exe when on WSL
function run(cmd: string, cwd: string = PROJECT_ROOT) {
  const opts: ExecSyncOptions = { stdio: "inherit", encoding: "utf-8", cwd };
  if (IS_WSL && cmd.startsWith("cre ")) {
    const winCmd = `cmd.exe /c "${cmd}"`;
    console.log(`\n> ${winCmd}\n`);
    execSync(winCmd, { ...opts, cwd: undefined, env: { ...process.env, CD: toWinPath(cwd) } });
  } else {
    console.log(`\n> ${cmd}\n`);
    execSync(cmd, opts);
  }
}

function runCre(args: string, cwd: string = PROJECT_ROOT) {
  const creCmd = `cre ${args}`;
  if (IS_WSL) {
    const winCwd = toWinPath(cwd);
    const fullCmd = `cmd.exe /c "cd /d ${winCwd} && ${creCmd}"`;
    console.log(`\n> ${fullCmd}\n`);
    execSync(fullCmd, { stdio: "inherit", encoding: "utf-8" });
  } else {
    console.log(`\n> ${creCmd}\n`);
    execSync(creCmd, { stdio: "inherit", encoding: "utf-8", cwd });
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function header(step: string, total: string, msg: string) {
  console.log(`\n[${step}/${total}] ${msg}`);
}

async function main() {
  console.log("=============================================");
  console.log("  Attestation Workflow - CRE Simulation Test");
  console.log("=============================================\n");
  await delay(1000);

  const TOTAL_STEPS = "4";

  // ------------------------------------------------------------------
  // Step 1: Pre-flight checks
  // ------------------------------------------------------------------
  header("1", TOTAL_STEPS, "Running pre-flight checks...");
  await delay(800);

  try {
    if (IS_WSL) {
      execSync('cmd.exe /c "cre version"', { stdio: "pipe" });
    } else {
      execSync("cre version", { stdio: "pipe" });
    }
    console.log(`  - cre CLI: found (via ${IS_WSL ? "cmd.exe" : "native"})`);
  } catch {
    console.error("ERROR: 'cre' CLI not found.");
    process.exit(1);
  }
  await delay(800);

  if (!existsSync(resolve(PROJECT_ROOT, ".env"))) {
    console.error("ERROR: .env file not found at project root.");
    process.exit(1);
  }
  console.log("  - .env: found");
  await delay(800);

  if (!existsSync(resolve(ATTESTATION_DIR, "main.ts"))) {
    console.error("ERROR: Attestation/main.ts not found.");
    process.exit(1);
  }
  console.log("  - Attestation/main.ts: found");
  await delay(600);
  console.log(`  - Project root: ${PROJECT_ROOT}`);
  await delay(500);
  console.log("  [OK] Pre-flight checks passed.");
  await delay(1000);

  // ------------------------------------------------------------------
  // Step 2: Install dependencies
  // ------------------------------------------------------------------
  header("2", TOTAL_STEPS, "Installing Attestation workflow dependencies...");
  await delay(800);

  if (!existsSync(resolve(ATTESTATION_DIR, "node_modules"))) {
    run("bun install", ATTESTATION_DIR);
  } else {
    console.log("  Dependencies already installed, skipping.");
  }
  await delay(1000);
  console.log("  [OK] Dependencies ready.");
  await delay(1000);

  // ------------------------------------------------------------------
  // Step 3: Simulate the Attestation workflow
  // ------------------------------------------------------------------
  header("3", TOTAL_STEPS, "Simulating Attestation workflow...");
  await delay(800);
  console.log("  Trigger: HTTP (index 0)");
  await delay(800);
  console.log("  Target:  staging-settings");
  await delay(800);
  console.log("  Payload: {} (empty - the workflow only needs the PRIVATE_KEY secret)");
  await delay(1000);

  try {
    const attestWin = IS_WSL ? toWinPath(ATTESTATION_DIR) : ATTESTATION_DIR;
    const projWin = IS_WSL ? toWinPath(PROJECT_ROOT) : PROJECT_ROOT;
    runCre(
      `workflow simulate "${attestWin}" --non-interactive --trigger-index 0 --http-payload "{}" -T staging-settings -R "${projWin}"`
    );
    await delay(1000);
    console.log("\n  [OK] Attestation simulation completed successfully.");
  } catch (err: any) {
    console.error(`\n  [FAIL] Attestation simulation failed (exit code: ${err.status}).`);
    process.exit(err.status ?? 1);
  }
  await delay(1000);

  // ------------------------------------------------------------------
  // Step 4: Summary
  // ------------------------------------------------------------------
  header("4", TOTAL_STEPS, "Test Summary");
  await delay(800);
  console.log("=============================================");
  console.log("  Workflow:   Attestation");
  await delay(600);
  console.log("  Trigger:    HTTP (non-interactive)");
  await delay(600);
  console.log("  Target:     staging-settings");
  await delay(600);
  console.log("  Result:     PASSED");
  console.log("=============================================");
  await delay(1000);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
