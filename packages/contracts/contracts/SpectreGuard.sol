// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@safe-global/safe-contracts/contracts/common/Enum.sol";
import "@safe-global/safe-contracts/contracts/base/GuardManager.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./interfaces/ISpectreGuard.sol";

/**
 * @title SpectreGuard
 * @notice Safe Guard with TEE-attested inbound and outbound enforcement.
 * @dev - Inbound: payer sends ETH to this contract address with attestation
 *        in calldata. Guard validates and forwards to Safe. Bare sends revert.
 *      - Outbound: Guard intercepts Safe.execTransaction and requires TEE attestation.
 *      - Delegatecalls are blocked.
 *      The guard address IS the invoice payment address.
 */
contract SpectreGuard is BaseGuard, EIP712, ISpectreGuard {
    using ECDSA for bytes32;

    bytes32 public constant INBOUND_TYPEHASH = keccak256(
        "SpectreInbound(address from,address to,uint256 value,uint256 nonce,uint256 deadline,bytes32 invoiceId)"
    );

    bytes32 public constant OUTBOUND_TYPEHASH = keccak256(
        "SpectreOutbound(address safe,address to,uint256 value,uint256 nonce,uint256 deadline,bytes32 invoiceId)"
    );

    address public teeSigner;
    address public safe;
    mapping(uint256 => bool) public usedNonces;
    uint256 public constant MAX_DEADLINE_WINDOW = 1 hours;

    error InvalidSignature();
    error NonceAlreadyUsed();
    error DeadlineExpired();
    error DeadlineTooFarInFuture();
    error ZeroValue();
    error OnlySafe();
    error ZeroAddress();
    error DelegateCallBlocked();
    error DirectTransferBlocked();

    constructor(
        address _teeSigner,
        address _safe
    ) EIP712("SpectreGuard", "1") {
        if (_teeSigner == address(0)) revert ZeroAddress();
        if (_safe == address(0)) revert ZeroAddress();
        teeSigner = _teeSigner;
        safe = _safe;
    }

    // --- Inbound: bare ETH send (no data) → revert ---
    receive() external payable {
        revert DirectTransferBlocked();
    }

    // --- Inbound: raw ETH send with TEE attestation in calldata ---
    // Payer does: sendTransaction({ to: guardAddress, value, data: attestationBytes })
    // Calldata: invoiceId (32) | nonce (32) | deadline (32) | teeSignature (65) = 161 bytes
    fallback() external payable {
        if (msg.value == 0) revert ZeroValue();
        require(msg.data.length == 161, "Invalid attestation data");

        bytes32 invoiceId;
        uint256 nonce;
        uint256 deadline;
        assembly {
            invoiceId := calldataload(0)
            nonce := calldataload(32)
            deadline := calldataload(64)
        }
        bytes memory teeSignature = msg.data[96:161];

        _validateDeadline(deadline);
        _consumeNonce(nonce);

        bytes32 structHash = keccak256(abi.encode(
            INBOUND_TYPEHASH,
            msg.sender,
            address(this),
            msg.value,
            nonce,
            deadline,
            invoiceId
        ));

        _verifySignature(structHash, teeSignature);

        (bool sent, ) = safe.call{value: msg.value}("");
        require(sent, "ETH forward failed");

        emit InboundValidated(msg.sender, invoiceId, msg.value, nonce);
    }

    // --- Outbound: Safe Guard hook (called before execTransaction) ---
    function checkTransaction(
        address to,
        uint256 value,
        bytes memory,
        Enum.Operation operation,
        uint256,
        uint256,
        uint256,
        address,
        address payable,
        bytes memory signatures,
        address
    ) external override {
        if (msg.sender != safe) revert OnlySafe();
        if (operation == Enum.Operation.DelegateCall) revert DelegateCallBlocked();

        _validateOutbound(to, value, signatures);
    }

    // --- Post-execution hook (no-op) ---
    function checkAfterExecution(bytes32, bool) external view override {
        if (msg.sender != safe) revert OnlySafe();
    }

    // --- Admin: rotate TEE signer ---
    function setTeeSigner(address newSigner) external {
        if (msg.sender != safe) revert OnlySafe();
        if (newSigner == address(0)) revert ZeroAddress();

        address oldSigner = teeSigner;
        teeSigner = newSigner;

        emit TeeSignerUpdated(oldSigner, newSigner);
    }

    function isNonceUsed(uint256 nonce) external view returns (bool) {
        return usedNonces[nonce];
    }

    function getTeeSigner() external view returns (address) {
        return teeSigner;
    }

    // --- Internal: validate outbound TEE attestation ---
    function _validateOutbound(
        address to,
        uint256 value,
        bytes memory signatures
    ) internal {
        // TEE attestation is appended after Safe signatures:
        // [Safe sigs...][nonce (32)][deadline (32)][invoiceId (32)][teeSignature (65)]
        uint256 teeDataLen = 32 + 32 + 32 + 65;
        require(signatures.length >= teeDataLen, "Missing TEE attestation");

        uint256 offset = signatures.length - teeDataLen;
        uint256 nonce;
        uint256 deadline;
        bytes32 invoiceId;

        assembly {
            let ptr := add(add(signatures, 32), offset)
            nonce := mload(ptr)
            deadline := mload(add(ptr, 32))
            invoiceId := mload(add(ptr, 64))
        }

        bytes memory teeSignature = new bytes(65);
        for (uint256 i = 0; i < 65; i++) {
            teeSignature[i] = signatures[offset + 96 + i];
        }

        _validateDeadline(deadline);
        _consumeNonce(nonce);

        bytes32 structHash = keccak256(abi.encode(
            OUTBOUND_TYPEHASH,
            safe,
            to,
            value,
            nonce,
            deadline,
            invoiceId
        ));

        _verifySignature(structHash, teeSignature);

        emit OutboundValidated(safe, to, value, nonce);
    }

    function _validateDeadline(uint256 deadline) internal view {
        if (deadline < block.timestamp) revert DeadlineExpired();
        if (deadline > block.timestamp + MAX_DEADLINE_WINDOW) revert DeadlineTooFarInFuture();
    }

    function _consumeNonce(uint256 nonce) internal {
        if (usedNonces[nonce]) revert NonceAlreadyUsed();
        usedNonces[nonce] = true;
    }

    function _verifySignature(bytes32 structHash, bytes memory signature) internal view {
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(digest, signature);
        if (recovered != teeSigner) revert InvalidSignature();
    }
}
