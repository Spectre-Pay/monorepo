import "@nomicfoundation/hardhat-ethers";
import hardhat from "hardhat";
import { ethers } from "ethers";

// Store pending tx context for later execution
interface PendingTx {
    safeAddress: string;
    setGuardData: string;
    safeInterface: ethers.Interface;
}

const pendingTxs = new Map<string, PendingTx>();

const getHardhatEthers = async () => {
    const connection = await hardhat.network.connect();
    return connection.ethers;
}

export const generateSafe = async (deployer: Uint8Array) => {
    const hre = await getHardhatEthers();
    const deployerAddress = ethers.computeAddress(ethers.hexlify(deployer));
    const [signer] = await hre.getSigners();

    // 1. Deploy Safe singleton
    const SafeFactory = await hre.getContractFactory("Safe");
    const safeSingleton = await SafeFactory.deploy();
    await safeSingleton.waitForDeployment();

    // 2. Deploy SafeProxyFactory
    const ProxyFactoryFactory = await hre.getContractFactory("SafeProxyFactory");
    const proxyFactory = await ProxyFactoryFactory.deploy();
    await proxyFactory.waitForDeployment();

    // 3. Create a Safe proxy for the deployer (1-of-1)
    const setupData = safeSingleton.interface.encodeFunctionData("setup", [
        [deployerAddress],
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
    if (!receipt) throw new Error("Transaction receipt is null");

    const event = receipt.logs.find((log: any) => {
        try {
            return proxyFactory.interface.parseLog(log)?.name === "ProxyCreation";
        } catch {
            return false;
        }
    });
    const safeAddress = proxyFactory.interface.parseLog(event!)!.args[0];

    // 4. Deploy SpectreGuard
    // For local testing, use deployer as TEE signer
    const teeSigner = deployerAddress;
    const GuardFactory = await hre.getContractFactory("SpectreGuard");
    const guard = await GuardFactory.deploy(teeSigner, safeAddress);
    await guard.waitForDeployment();

    // 5. Attach guard to Safe
    console.log("\n--- Attaching Guard to Safe ---");
    const safe = new ethers.Contract(safeAddress, safeSingleton.interface, signer);
    const setGuardData = safe.interface.encodeFunctionData("setGuard", [
        await guard.getAddress(),
    ]);

    const safeNonce = await safe.nonce();
    const txHash = await safe.getTransactionHash(
        safeAddress, 0, setGuardData, 0, 0, 0, 0,
        ethers.ZeroAddress, ethers.ZeroAddress, safeNonce
    );
    // Store context for later execution
    pendingTxs.set(txHash, {
        safeAddress,
        setGuardData,
        safeInterface: safeSingleton.interface,
    });

    return txHash;
}

export const executeSafeTx = async (txHash: string, signedTx: string) => {
    const hre = await getHardhatEthers();
    const pending = pendingTxs.get(txHash);
    if (!pending) throw new Error("No pending transaction found for this txHash.");

    const [signer] = await hre.getSigners();
    const safe = new ethers.Contract(pending.safeAddress, pending.safeInterface, signer);

    const sigBytes = ethers.getBytes(signedTx);
    sigBytes[64] += 4;

    const execTx = await safe.execTransaction(
        pending.safeAddress, 0, pending.setGuardData, 0, 0, 0, 0,
        ethers.ZeroAddress, ethers.ZeroAddress,
        ethers.hexlify(sigBytes)
    );
    const receipt = await execTx.wait();

    pendingTxs.delete(txHash);

    return receipt.hash;
}
