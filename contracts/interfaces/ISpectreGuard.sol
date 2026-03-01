// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface ISpectreGuard {
    /// @notice Emitted when an inbound deposit is validated via TEE attestation
    event InboundValidated(
        address indexed from,
        bytes32 indexed invoiceId,
        uint256 value,
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

    /// @notice Update the TEE signer address (only callable by the Safe itself)
    function setTeeSigner(address newSigner) external;

    /// @notice Check if a nonce has been used
    function isNonceUsed(uint256 nonce) external view returns (bool);

    /// @notice Get the current TEE signer address
    function getTeeSigner() external view returns (address);
}
