import { execSync, type ExecSyncOptions } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { platform } from "node:os";

// ==========================================================================
// Attestation Workflow Test Script
// Tests EIP-712 SpectreGuard attestations (inbound + outbound) via CRE CLI
// ==========================================================================

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ATTESTATION_DIR = resolve(PROJECT_ROOT, "Attestation");
const IS_WSL = platform() === "linux" && existsSync("/proc/version") &&
  execSync("cat /proc/version", { encoding: "utf-8" }).toLowerCase().includes("microsoft");

// ── ANSI helpers ─────────────────────────────────────────────────────

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const BG_GREEN = "\x1b[42m\x1b[30m";
const BG_RED = "\x1b[41m\x1b[37m";

function ok(msg: string) { console.log(`  ${GREEN}+${RESET} ${msg}`); }
function info(msg: string) { console.log(`  ${DIM}${msg}${RESET}`); }
function result(label: string, value: string) {
  console.log(`  ${CYAN}${label}${RESET}  ${BOLD}${value}${RESET}`);
}

function banner() {
  console.log("");
  console.log(`${BOLD}${CYAN}  +-------------------------------------------------+${RESET}`);
  console.log(`${BOLD}${CYAN}  |                                                 |${RESET}`);
  console.log(`${BOLD}${CYAN}  |   SpectreGuard  -  Attestation Workflow          |${RESET}`);
  console.log(`${BOLD}${CYAN}  |   CRE Simulation Test Suite                     |${RESET}`);
  console.log(`${BOLD}${CYAN}  |                                                 |${RESET}`);
  console.log(`${BOLD}${CYAN}  +-------------------------------------------------+${RESET}`);
  console.log("");
}

function step(n: number, total: number, title: string) {
  console.log("");
  console.log(`${BOLD}  [${n}/${total}] ${title}${RESET}`);
  console.log(`  ${DIM}${"─".repeat(50)}${RESET}`);
}

function statusBadge(status: "PASS" | "FAIL") {
  if (status === "PASS") return `${BG_GREEN} PASS ${RESET}`;
  return `${BG_RED} FAIL ${RESET}`;
}

// ── Path helpers ─────────────────────────────────────────────────────

function toWinPath(p: string): string {
  if (!IS_WSL) return p;
  return execSync(`wslpath -w "${p}"`, { encoding: "utf-8" }).trim();
}

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

function runCreCapture(args: string, cwd: string = PROJECT_ROOT): string {
  const creCmd = `cre ${args}`;
  try {
    let output: string;
    if (IS_WSL) {
      const winCwd = toWinPath(cwd);
      output = execSync(`cmd.exe /c "cd /d ${winCwd} && ${creCmd}"`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    } else {
      output = execSync(creCmd, { encoding: "utf-8", cwd, maxBuffer: 10 * 1024 * 1024 });
    }
    console.log(output);
    return output;
  } catch (err: any) {
    const stdout = err.stdout?.toString() || "";
    const stderr = err.stderr?.toString() || "";
    if (stderr) console.log(`  ${RED}CRE error: ${stderr.trim()}${RESET}`);
    if (stdout) console.log(stdout);
    throw err;
  }
}

function buildCreSimulateCmd(triggerIndex: number, payload: string): string {
  const attestWin = IS_WSL ? toWinPath(ATTESTATION_DIR) : ATTESTATION_DIR;
  const projWin = IS_WSL ? toWinPath(PROJECT_ROOT) : PROJECT_ROOT;
  const escapedPayload = payload.replace(/"/g, '\\"');
  return `workflow simulate "${attestWin}" --non-interactive --trigger-index ${triggerIndex} --http-payload "${escapedPayload}" -T staging-settings -R "${projWin}"`;
}

/**
 * Parse simulation output — CRE returns base64-encoded bytes in quotes.
 * For attestation, the raw bytes are the 161-byte packed attestation.
 */
function parseSimulationBytes(output: string): Uint8Array | null {
  const match = output.match(/"([A-Za-z0-9+/=]+)"/);
  if (!match) return null;
  try {
    const decoded = atob(match[1]);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function simulate(triggerIndex: number, payload: object): Uint8Array | null {
  info(`Simulating trigger ${triggerIndex} via CRE CLI...`);
  const output = runCreCapture(buildCreSimulateCmd(triggerIndex, JSON.stringify(payload)));
  if (output.includes("Workflow compiled")) ok("Workflow compiled");
  return parseSimulationBytes(output);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  banner();

  const TOTAL = 5;
  const results: { name: string; status: "PASS" | "FAIL" }[] = [];

  // ------------------------------------------------------------------
  // Step 1: Pre-flight checks
  // ------------------------------------------------------------------
  step(1, TOTAL, "Pre-flight checks");
  await delay(500);

  try {
    if (IS_WSL) {
      execSync('cmd.exe /c "cre version"', { stdio: "pipe" });
    } else {
      execSync("cre version", { stdio: "pipe" });
    }
    ok(`cre CLI found (${IS_WSL ? "cmd.exe" : "native"})`);
  } catch {
    console.error(`  ${RED}ERROR: 'cre' CLI not found.${RESET}`);
    process.exit(1);
  }

  if (!existsSync(resolve(PROJECT_ROOT, ".env"))) {
    console.error(`  ${RED}ERROR: .env not found at project root.${RESET}`);
    process.exit(1);
  }
  ok(".env found");

  if (!existsSync(resolve(ATTESTATION_DIR, "main.ts"))) {
    console.error(`  ${RED}ERROR: Attestation/main.ts not found.${RESET}`);
    process.exit(1);
  }
  ok("Attestation/main.ts found");
  info(`Project root: ${PROJECT_ROOT}`);

  // ------------------------------------------------------------------
  // Step 2: Install dependencies
  // ------------------------------------------------------------------
  step(2, TOTAL, "Install dependencies");
  await delay(500);

  if (!existsSync(resolve(ATTESTATION_DIR, "node_modules"))) {
    run("bun install", ATTESTATION_DIR);
  } else {
    info("Dependencies already installed, skipping.");
  }
  ok("Dependencies ready");

  // ------------------------------------------------------------------
  // Step 3: Inbound attestation (Trigger 0)
  // ------------------------------------------------------------------
  step(3, TOTAL, "Inbound attestation (SpectreInbound)");
  await delay(500);

  const inboundPayload = {
    from: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    value: "100000000000000000",   // 0.1 ETH
    nonce: 1,
    deadline: 9999999999,
    invoiceId: "DEPOSIT-001",
  };

  info(`Payload: ${JSON.stringify(inboundPayload, null, 2)}`);

  try {
    const inboundResult = simulate(0, inboundPayload);
    if (inboundResult && inboundResult.length === 161) {
      ok(`Inbound attestation returned 161 bytes`);
      result("invoiceId (32B) ", "0x" + bytesToHex(inboundResult.slice(0, 32)));
      result("nonce (32B)     ", "0x" + bytesToHex(inboundResult.slice(32, 64)));
      result("deadline (32B)  ", "0x" + bytesToHex(inboundResult.slice(64, 96)));
      result("signature r     ", "0x" + bytesToHex(inboundResult.slice(96, 128)));
      result("signature s     ", "0x" + bytesToHex(inboundResult.slice(128, 160)));
      const v = inboundResult[160];
      result("signature v     ", `${v} (${v === 27 || v === 28 ? "valid" : "INVALID"})`);
      results.push({ name: "Inbound attestation", status: "PASS" });
    } else {
      console.log(`  ${RED}Unexpected output length: ${inboundResult?.length ?? "null"}${RESET}`);
      results.push({ name: "Inbound attestation", status: "FAIL" });
    }
  } catch (err: any) {
    console.error(`  ${RED}Inbound simulation failed: ${err.message}${RESET}`);
    results.push({ name: "Inbound attestation", status: "FAIL" });
  }

  // ------------------------------------------------------------------
  // Step 4: Outbound attestation (Trigger 1)
  // ------------------------------------------------------------------
  step(4, TOTAL, "Outbound attestation (SpectreOutbound)");
  await delay(500);

  const outboundPayload = {
    safe: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    to: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    value: "50000000000000000",    // 0.05 ETH
    nonce: 2,
    deadline: 9999999999,
    invoiceId: "WITHDRAW-001",
  };

  info(`Payload: ${JSON.stringify(outboundPayload, null, 2)}`);

  try {
    const outboundResult = simulate(1, outboundPayload);
    if (outboundResult && outboundResult.length === 161) {
      ok(`Outbound attestation returned 161 bytes`);
      result("nonce (32B)     ", "0x" + bytesToHex(outboundResult.slice(0, 32)));
      result("deadline (32B)  ", "0x" + bytesToHex(outboundResult.slice(32, 64)));
      result("invoiceId (32B) ", "0x" + bytesToHex(outboundResult.slice(64, 96)));
      result("signature r     ", "0x" + bytesToHex(outboundResult.slice(96, 128)));
      result("signature s     ", "0x" + bytesToHex(outboundResult.slice(128, 160)));
      const v = outboundResult[160];
      result("signature v     ", `${v} (${v === 27 || v === 28 ? "valid" : "INVALID"})`);
      results.push({ name: "Outbound attestation", status: "PASS" });
    } else {
      console.log(`  ${RED}Unexpected output length: ${outboundResult?.length ?? "null"}${RESET}`);
      results.push({ name: "Outbound attestation", status: "FAIL" });
    }
  } catch (err: any) {
    console.error(`  ${RED}Outbound simulation failed: ${err.message}${RESET}`);
    results.push({ name: "Outbound attestation", status: "FAIL" });
  }

  // ------------------------------------------------------------------
  // Step 5: Summary
  // ------------------------------------------------------------------
  step(5, TOTAL, "Test Summary");

  console.log("");
  console.log(`  ${BOLD}${CYAN}${"─".repeat(50)}${RESET}`);
  console.log(`  ${BOLD}  SpectreGuard Attestation Workflow Results${RESET}`);
  console.log(`  ${BOLD}${CYAN}${"─".repeat(50)}${RESET}`);
  console.log("");

  for (const r of results) {
    console.log(`  ${statusBadge(r.status)}  ${r.name}`);
  }

  const passed = results.filter(r => r.status === "PASS").length;
  const total = results.length;

  console.log("");
  console.log(`  ${BOLD}${passed}/${total} tests passed${RESET}`);
  console.log(`  ${BOLD}${CYAN}${"─".repeat(50)}${RESET}`);
  console.log("");

  if (passed < total) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
