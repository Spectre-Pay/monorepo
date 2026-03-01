import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // 1. Deploy Safe singleton
  console.log("\n--- Deploying Safe Singleton ---");
  const SafeFactory = await ethers.getContractFactory("Safe");
  const safeSingleton = await SafeFactory.deploy();
  await safeSingleton.waitForDeployment();
  console.log("Safe Singleton:", await safeSingleton.getAddress());

  // 2. Deploy SafeProxyFactory
  console.log("\n--- Deploying SafeProxyFactory ---");
  const ProxyFactoryFactory = await ethers.getContractFactory("SafeProxyFactory");
  const proxyFactory = await ProxyFactoryFactory.deploy();
  await proxyFactory.waitForDeployment();
  console.log("SafeProxyFactory:", await proxyFactory.getAddress());

  // 3. Create a Safe proxy for the deployer (1-of-1)
  console.log("\n--- Creating Safe Proxy ---");
  const setupData = safeSingleton.interface.encodeFunctionData("setup", [
    [deployer.address],
    1,
    ethers.ZeroAddress,
    "0x",
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    ethers.ZeroAddress,
  ]);

  const tx = await proxyFactory.createProxyWithNonce(
    await safeSingleton.getAddress(),
    setupData,
    0
  );
  const receipt = await tx.wait();

  const event = receipt.logs.find((log: any) => {
    try {
      return proxyFactory.interface.parseLog(log)?.name === "ProxyCreation";
    } catch {
      return false;
    }
  });
  const safeAddress = proxyFactory.interface.parseLog(event!)!.args[0];
  console.log("Safe Proxy:", safeAddress);

  // 4. Deploy SpectreGuard
  // For local testing, use deployer as TEE signer
  const teeSigner = deployer.address;
  console.log("\n--- Deploying SpectreGuard ---");
  const GuardFactory = await ethers.getContractFactory("SpectreGuard");
  const guard = await GuardFactory.deploy(teeSigner, safeAddress);
  await guard.waitForDeployment();
  console.log("SpectreGuard:", await guard.getAddress());
  console.log("TEE Signer:", teeSigner);

  // 5. Attach guard to Safe
  console.log("\n--- Attaching Guard to Safe ---");
  const safe = new ethers.Contract(safeAddress, safeSingleton.interface, deployer);
  const setGuardData = safe.interface.encodeFunctionData("setGuard", [
    await guard.getAddress(),
  ]);

  const safeNonce = await safe.nonce();
  const txHash = await safe.getTransactionHash(
    safeAddress, 0, setGuardData, 0, 0, 0, 0,
    ethers.ZeroAddress, ethers.ZeroAddress, safeNonce
  );
  const sig = await deployer.signMessage(ethers.getBytes(txHash));
  const sigBytes = ethers.getBytes(sig);
  sigBytes[64] += 4;

  await safe.execTransaction(
    safeAddress, 0, setGuardData, 0, 0, 0, 0,
    ethers.ZeroAddress, ethers.ZeroAddress,
    ethers.hexlify(sigBytes)
  );
  console.log("Guard attached to Safe");

  // Summary
  console.log("\n========== DEPLOYMENT SUMMARY ==========");
  console.log("Safe Singleton:    ", await safeSingleton.getAddress());
  console.log("SafeProxyFactory:  ", await proxyFactory.getAddress());
  console.log("Safe Proxy:        ", safeAddress);
  console.log("SpectreGuard:      ", await guard.getAddress());
  console.log("TEE Signer:        ", teeSigner);
  console.log("=========================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
