// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@safe-global/safe-contracts/contracts/common/Enum.sol";
import "@safe-global/safe-contracts/contracts/base/GuardManager.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./interfaces/ISpectreGuard.sol";

/**
 * @title SpectreGuard
 * @notice Safe Guard module that enforces TEE-attested compliance on all inbound and outbound transfers.
 * @dev Implements the Safe Guard interface. Attach to a Safe via `setGuard()`.
 *      - Inbound: payers must call `attestedDeposit()` with a valid TEE signature.
 *      - Outbound: Safe `execTransaction` calls are intercepted by `checkTransaction()`,
 *        which requires a TEE attestation packed into the appended extra data.
 *      - Raw ETH via `receive()` is blocked.
 *      - Delegatecalls are blocked.
 */
contract SpectreGuard is BaseGuard, EIP712, ISpectreGuard {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    // --- EIP-712 type hashes ---
    bytes32 public constant INBOUND_TYPEHASH = keccak256(
        "SpectreInbound(address from,address to,uint256 value,uint256 nonce,uint256 deadline,bytes32 invoiceId)"
    );

    bytes32 public constant INBOUND_TOKEN_TYPEHASH = keccak256(
        "SpectreInboundToken(address from,address to,address token,uint256 amount,uint256 nonce,uint256 deadline,bytes32 invoiceId)"
    );

    bytes32 public constant OUTBOUND_TYPEHASH = keccak256(
        "SpectreOutbound(address safe,address to,uint256 value,uint256 nonce,uint256 deadline,bytes32 invoiceId)"
    );

    // --- State ---
    address public teeSigner;
    address public safe; // the Safe this guard is attached to
    mapping(uint256 => bool) public usedNonces;
    uint256 public constant MAX_DEADLINE_WINDOW = 1 hours;

    // --- Errors ---
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

    // --- Block bare ETH transfers (no calldata = no attestation) ---
    receive() external payable {
        revert DirectTransferBlocked();
    }

    // --- Raw ETH with TEE attestation in calldata ---
    // Calldata format: invoiceId (32) | nonce (32) | deadline (32) | teeSignature (65) = 161 bytes
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

        // Forward ETH to the Safe
        (bool sent, ) = safe.call{value: msg.value}("");
        require(sent, "ETH forward failed");

        emit AttestedDeposit(msg.sender, invoiceId, msg.value, nonce);
    }

    // --- Inbound: ETH deposit with TEE attestation ---
    function attestedDeposit(
        bytes32 invoiceId,
        uint256 nonce,
        uint256 deadline,
        bytes calldata teeSignature
    ) external payable {
        if (msg.value == 0) revert ZeroValue();
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

        // Forward ETH to the Safe
        (bool sent, ) = safe.call{value: msg.value}("");
        require(sent, "ETH forward failed");

        emit AttestedDeposit(msg.sender, invoiceId, msg.value, nonce);
    }

    // --- Inbound: ERC-20 deposit with TEE attestation ---
    function attestedTokenDeposit(
        address token,
        uint256 amount,
        bytes32 invoiceId,
        uint256 nonce,
        uint256 deadline,
        bytes calldata teeSignature
    ) external {
        if (amount == 0) revert ZeroValue();
        if (token == address(0)) revert ZeroAddress();
        _validateDeadline(deadline);
        _consumeNonce(nonce);

        bytes32 structHash = keccak256(abi.encode(
            INBOUND_TOKEN_TYPEHASH,
            msg.sender,
            address(this),
            token,
            amount,
            nonce,
            deadline,
            invoiceId
        ));

        _verifySignature(structHash, teeSignature);

        // Transfer tokens from sender to the Safe
        IERC20(token).safeTransferFrom(msg.sender, safe, amount);

        emit AttestedTokenDeposit(msg.sender, token, invoiceId, amount, nonce);
    }

    // --- Outbound: Safe Guard hook (called before execTransaction) ---
    // Uses minimal stack variables to avoid stack-too-deep
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

    // --- Post-execution hook (no-op for POC) ---
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

    // --- View functions ---
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
        // Extract TEE attestation from the end of signatures
        // Format: [Safe signatures...][nonce (32)][deadline (32)][invoiceId (32)][teeSignature (65)]
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

    // --- Internal helpers ---
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
