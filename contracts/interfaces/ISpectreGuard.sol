// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface ISpectreGuard {
    /// @notice Emitted when an attested ETH deposit is received
    event AttestedDeposit(
        address indexed sender,
        bytes32 indexed invoiceId,
        uint256 value,
        uint256 nonce
    );

    /// @notice Emitted when an attested ERC-20 deposit is received
    event AttestedTokenDeposit(
        address indexed sender,
        address indexed token,
        bytes32 indexed invoiceId,
        uint256 amount,
        uint256 nonce
    );

    /// @notice Emitted when an outbound transaction is validated
    event OutboundValidated(
        address indexed safe,
        address indexed to,
        uint256 value,
        uint256 nonce
    );

    /// @notice Emitted when the TEE signer is rotated
    event TeeSignerUpdated(address indexed oldSigner, address indexed newSigner);

    /// @notice Deposit ETH with a TEE attestation signature
    function attestedDeposit(
        bytes32 invoiceId,
        uint256 nonce,
        uint256 deadline,
        bytes calldata teeSignature
    ) external payable;

    /// @notice Deposit ERC-20 tokens with a TEE attestation signature
    function attestedTokenDeposit(
        address token,
        uint256 amount,
        bytes32 invoiceId,
        uint256 nonce,
        uint256 deadline,
        bytes calldata teeSignature
    ) external;

    /// @notice Update the TEE signer address (only callable by the Safe itself)
    function setTeeSigner(address newSigner) external;

    /// @notice Check if a nonce has been used
    function isNonceUsed(uint256 nonce) external view returns (bool);

    /// @notice Get the current TEE signer address
    function getTeeSigner() external view returns (address);
}
