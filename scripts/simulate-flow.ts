import { ethers } from "hardhat";

/**
 * Simulates the full Spectre invoice flow:
 * 1. Deploy infrastructure
 * 2. Payer sends attested deposit
 * 3. Recipient withdraws with attestation
 */
async function main() {
  const [deployer, payer, recipient] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  console.log("=== SPECTRE INVOICES — FLOW SIMULATION ===\n");
  console.log("Deployer:  ", deployer.address);
  console.log("Payer:     ", payer.address);
  console.log("Recipient: ", recipient.address);

  // --- Setup ---
  console.log("\n--- STEP 1: Deploy Infrastructure ---");

  const SafeFactory = await ethers.getContractFactory("Safe");
  const safeSingleton = await SafeFactory.deploy();
  await safeSingleton.waitForDeployment();

  const ProxyFactoryFactory = await ethers.getContractFactory("SafeProxyFactory");
  const proxyFactory = await ProxyFactoryFactory.deploy();
  await proxyFactory.waitForDeployment();

  // Create Safe for recipient
  const setupData = safeSingleton.interface.encodeFunctionData("setup", [
    [recipient.address], 1,
    ethers.ZeroAddress, "0x", ethers.ZeroAddress,
    ethers.ZeroAddress, 0, ethers.ZeroAddress,
  ]);
  const tx = await proxyFactory.createProxyWithNonce(
    await safeSingleton.getAddress(), setupData, 0
  );
  const receipt = await tx.wait();
  const event = receipt.logs.find((log: any) => {
    try { return proxyFactory.interface.parseLog(log)?.name === "ProxyCreation"; }
    catch { return false; }
  });
  const safeAddress = proxyFactory.interface.parseLog(event!)!.args[0];
  const safe = new ethers.Contract(safeAddress, safeSingleton.interface, recipient);

  // Use deployer as TEE signer for simulation
  const teeSigner = deployer;

  const GuardFactory = await ethers.getContractFactory("SpectreGuard");
  const guard = await GuardFactory.deploy(teeSigner.address, safeAddress);
  await guard.waitForDeployment();
  const guardAddr = await guard.getAddress();

  // Attach guard
  const setGuardData = safe.interface.encodeFunctionData("setGuard", [guardAddr]);
  const safeNonce0 = await safe.nonce();
  const txHash0 = await safe.getTransactionHash(
    safeAddress, 0, setGuardData, 0, 0, 0, 0,
    ethers.ZeroAddress, ethers.ZeroAddress, safeNonce0
  );
  const sig0 = await recipient.signMessage(ethers.getBytes(txHash0));
  const sigBytes0 = ethers.getBytes(sig0);
  sigBytes0[64] += 4;
  await safe.execTransaction(
    safeAddress, 0, setGuardData, 0, 0, 0, 0,
    ethers.ZeroAddress, ethers.ZeroAddress,
    ethers.hexlify(sigBytes0)
  );

  console.log("  Safe deployed at:    ", safeAddress);
  console.log("  Guard deployed at:   ", guardAddr);
  console.log("  Guard attached to Safe");

  // --- Payer sends payment ---
  console.log("\n--- STEP 2: Payer Sends 1 ETH (Invoice INV-001) ---");
  const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("INV-001"));
  const block = await ethers.provider.getBlock("latest");
  const deadline = block!.timestamp + 3600;
  const amount = ethers.parseEther("1");

  // TEE signs inbound attestation
  const domain = {
    name: "SpectreGuard",
    version: "1",
    chainId,
    verifyingContract: guardAddr,
  };
  const inboundTypes = {
    SpectreInbound: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "invoiceId", type: "bytes32" },
    ],
  };
  const inboundSig = await teeSigner.signTypedData(domain, inboundTypes, {
    from: payer.address,
    to: guardAddr,
    value: amount,
    nonce: 0,
    deadline,
    invoiceId,
  });

  const depositTx = await guard.connect(payer).attestedDeposit(
    invoiceId, 0, deadline, inboundSig, { value: amount }
  );
  await depositTx.wait();

  const safeBalance = await ethers.provider.getBalance(safeAddress);
  console.log("  Deposit tx hash:     ", depositTx.hash);
  console.log("  Safe balance:        ", ethers.formatEther(safeBalance), "ETH");

  // --- Recipient withdraws ---
  console.log("\n--- STEP 3: Recipient Withdraws 1 ETH ---");
  const block2 = await ethers.provider.getBlock("latest");
  const deadline2 = block2!.timestamp + 3600;
  const withdrawInvoiceId = ethers.keccak256(ethers.toUtf8Bytes("WITHDRAW-001"));

  // TEE signs outbound attestation
  const outboundTypes = {
    SpectreOutbound: [
      { name: "safe", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "invoiceId", type: "bytes32" },
    ],
  };
  const outboundSig = await teeSigner.signTypedData(domain, outboundTypes, {
    safe: safeAddress,
    to: recipient.address,
    value: amount,
    nonce: 1,
    deadline: deadline2,
    invoiceId: withdrawInvoiceId,
  });

  // Build Safe owner signature
  const safeNonce = await safe.nonce();
  const txHash = await safe.getTransactionHash(
    recipient.address, amount, "0x", 0, 0, 0, 0,
    ethers.ZeroAddress, ethers.ZeroAddress, safeNonce
  );
  const safeSig = await recipient.signMessage(ethers.getBytes(txHash));
  const safeSigBytes = ethers.getBytes(safeSig);
  safeSigBytes[64] += 4;

  // Pack TEE attestation
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const teePacked = abiCoder.encode(
    ["uint256", "uint256", "bytes32"],
    [1, deadline2, withdrawInvoiceId]
  );
  const combinedSigs = ethers.concat([
    ethers.hexlify(safeSigBytes),
    teePacked,
    outboundSig,
  ]);

  const recipientBefore = await ethers.provider.getBalance(recipient.address);

  const withdrawTx = await safe.execTransaction(
    recipient.address, amount, "0x", 0, 0, 0, 0,
    ethers.ZeroAddress, ethers.ZeroAddress,
    combinedSigs
  );
  await withdrawTx.wait();

  const recipientAfter = await ethers.provider.getBalance(recipient.address);
  const safeFinal = await ethers.provider.getBalance(safeAddress);

  console.log("  Withdraw tx hash:    ", withdrawTx.hash);
  console.log("  Recipient gained:    ", ethers.formatEther(recipientAfter - recipientBefore), "ETH (minus gas)");
  console.log("  Safe final balance:  ", ethers.formatEther(safeFinal), "ETH");

  console.log("\n=== SIMULATION COMPLETE ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
