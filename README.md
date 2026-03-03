# Spectre Invoices — Contracts

TEE-attested Safe Guard for compliant crypto payments.

## Setup

```bash
npm install
npx hardhat compile
```

## Test

```bash
npx hardhat test
```

## Deploy

### Local

```bash
# start local node
npx hardhat node

# deploy
npx hardhat run scripts/deploy.ts --network localhost
```

### Base Sepolia

Add to `.env`:

```
DEPLOYER_PRIVATE_KEY=0x...
```

```bash
npx hardhat run scripts/deploy.ts --network baseSepolia
```

## Base Sepolia Deployment

| Contract | Address |
|----------|---------|
| Safe Singleton | `0xfc171A1561aC8BDC21dba67f83e2fb8ba2af2B17` |
| SafeProxyFactory | `0x01df4DF767Fba28a439D2Fdf43512Fd636C2c4F0` |
| Safe Proxy | `0x1aA90B64a7a78db5f61bED70f8AccD85BBcF8e46` |
| SpectreGuard | `0x8C8773aEa5c8BDeb3819F7bC2F47A5eCBF1E3260` |
