// // import { privateKeyToAccount } from "viem/accounts";
// // import {
// //   generateKeysFromSignature,
// //   extractViewingPrivateKeyNode,
// //   generateEphemeralPrivateKey,
// //   generateStealthAddresses,
// //   generateStealthPrivateKey,
// //   predictStealthSafeAddressWithClient,
// //   generateFluidkeyMessage,
// // } from "@fluidkey/stealth-account-kit";

// const generateaddress = async (): Promise<
//   {
//     nonce: bigint;
//     stealthSafeAddress: `0x${string}`;
//     stealthPrivateKey: `0x${string}`;
//   }[]
// > => {
//   let viewingPrivateKeyNodeNumber: number = 0;
//   let startNonce: bigint = BigInt(0);
//   let endNonce: bigint = BigInt(10);
//   let chainId: number = 84532;
//   const results: {
//     nonce: bigint;
//     stealthSafeAddress: `0x${string}`;
//     stealthPrivateKey: `0x${string}`;
//   }[] = [];

//   // Generate signature from which private keys will be derived
//   const account = privateKeyToAccount(
//     `0x9d1b1bc76d9e1586c2d9ebdc033ba02dd8b667f0315a9df72c2a433a980dbab8`,
//   );
//   const { message } = generateFluidkeyMessage({
//     pin: "0000", // fixed PIN for demo
//     address: account.address,
//   });
//   const signature = await account.signMessage({ message });

//   // Derive spending and viewing keys from the signature
//   const { spendingPrivateKey, viewingPrivateKey } =
//     generateKeysFromSignature(signature);

//   // Extract the viewing key node for ephemeral key generation
//   const privateViewingKeyNode = extractViewingPrivateKeyNode(
//     viewingPrivateKey,
//     viewingPrivateKeyNodeNumber,
//   );

//   // Get the spending public key
//   const spendingAccount = privateKeyToAccount(spendingPrivateKey);
//   const spendingPublicKey = spendingAccount.publicKey;

//   // Loop through nonce range and generate stealth addresses
//   for (let nonce = startNonce; nonce <= endNonce; nonce++) {
//     // Generate ephemeral private key for this nonce
//     const { ephemeralPrivateKey } = generateEphemeralPrivateKey({
//       viewingPrivateKeyNode: privateViewingKeyNode,
//       nonce,
//       chainId,
//     });

//     // Generate the stealth owner address
//     const { stealthAddresses } = generateStealthAddresses({
//       spendingPublicKeys: [spendingPublicKey],
//       ephemeralPrivateKey,
//     });

//     // Predict the stealth Safe address
//     const { stealthSafeAddress } = await predictStealthSafeAddressWithClient({
//       threshold: 1,
//       stealthAddresses,
//       safeVersion: "1.3.0",
//       useDefaultAddress: true,
//     });

//     // Derive the stealth private key that controls this Safe
//     const { stealthPrivateKey } = generateStealthPrivateKey({
//       spendingPrivateKey,
//       ephemeralPublicKey: privateKeyToAccount(ephemeralPrivateKey).publicKey,
//     });

//     results.push({ nonce, stealthSafeAddress, stealthPrivateKey });
//   }

//   return results;
// };

// export { generateaddress };
