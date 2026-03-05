import "@nomicfoundation/hardhat-ethers";
import hardhat from "hardhat";
import { ethers } from "ethers";

const STORAGE_ABI = [
    "function getNonce(string calldata wnsId) external view returns (uint)",
    "function incrementNonce(string calldata wnsId) external returns (uint)",
    "function getWns(string calldata name) external view returns (string)",
    "function setWns(string calldata name, string calldata value) external",
];

let storageContract: ethers.Contract | null = null;

const getStorageContract = async (contractAddress: string): Promise<ethers.Contract> => {
    if (storageContract) return storageContract;
    const connection = await hardhat.network.connect();
    const [signer] = await connection.ethers.getSigners();
    storageContract = new ethers.Contract(contractAddress, STORAGE_ABI, signer);
    return storageContract;
};

export const getNonce = async (contractAddress: string, wnsId: string): Promise<bigint> => {
    const contract = await getStorageContract(contractAddress);
    const nonce: bigint = await contract.getNonce(wnsId);
    return nonce;
};

export const incrementNonce = async (contractAddress: string, wnsId: string): Promise<bigint> => {
    const contract = await getStorageContract(contractAddress);
    const tx = await contract.incrementNonce(wnsId);
    await tx.wait();
    const newNonce: bigint = await contract.getNonce(wnsId);
    return newNonce;
};

export const storeEncryptedAddress = async (
    contractAddress: string,
    wnsId: string,
    encryptedValue: string,
): Promise<void> => {
    const contract = await getStorageContract(contractAddress);
    const tx = await contract.setWns(wnsId, encryptedValue);
    await tx.wait();
};

export const getEncryptedAddress = async (
    contractAddress: string,
    wnsId: string,
): Promise<string> => {
    const contract = await getStorageContract(contractAddress);
    return await contract.getWns(wnsId);
};
