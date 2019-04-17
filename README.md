# Nuo Network (Zeus) - contracts v2

![](https://s3.ap-south-1.amazonaws.com/nuo-public/nuo_app/public/nuo_lend_home.png)

<https://app.nuo.network>

Nuo Network is a decentralized lending platform powered by Ethereum blockchain. It acts as a debt marketplace that connects lenders and borrowers using smart contracts. This enables lenders to earn interest on their crypto assets by locking up their tokens and also provides instant crypto backed loans to borrowers.


## Deployments
### Mainnet

  - Account: 0x78b37409628e10df0b661c6b205b872a4df8dd6e
  - AccountFactory: 0xf5a38fbc26c720c79350b99d9c0bd42b3e9b8316
  - AccountFactoryV2: 0x4e9d7f37eadc6fef64b5f5dccc4deb6224667677
  - Config: 0x431f429035a1e3059d5c6a9a83208c6d3143d925
  - Kernel: 0x8dc3bcbb4b506fa2becd065ff4425dee32f156a6
  - MKernel: 0x740f8b58f5562c8379f2a8c2230c9be5c03ac3fc
  - Reserve: 0x64d14595152b430cf6940da15c6e39545c7c5b7e
  - DSGuard: 0xde4a88ef731cc55450c76e9307a64e94146006f7
  - DateTime: 0x2929e21109901461659c0f26ad7f0e7633ea6539
  - ReserveEscrow: 0x802275979b020f0ec871c5ec1db6e412b72ff20b
  - KernelEscrow: 0xaf38668f4719ecf9452dc0300be3f6c83cbf3721
  - KyberConnector: 0x521550e569bc80f1b4957c4f3fd3d677d9ca31f1
  - UniswapConnector: 0x9550050d102ff42a2a683a9fa23b8f3fb2b378c8

## Resources

  - [Medium](https://medium.com/nuo-news)


## Tools

- node v8.9.1
- npm v6.4.1
- truffle v4.1.14
- solidity v0.4.24
- [ganache UI v1.1.0](https://github.com/trufflesuite/ganache/releases/tag/v1.1.0) or ganache cli v6.1.0

## Setup

##### Dependecies
install dependencies:
```
npm install
npm install -g truffle@4.1.14
npm install -g ganache-cli@6.1.0
```

##### Testing
Start `ganache-cli`:
```
ganache-cli
```
Run `truffle` tests:
```
truffle test
```


