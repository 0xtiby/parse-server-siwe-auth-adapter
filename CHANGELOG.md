# Changelog

## [v2.2.0](https://github.com/0xtiby/parse-server-siwe-auth-adapter/releases/tag/v2.2.0) (2025-06-04)

# [2.2.0](https://github.com/0xtiby/parse-server-siwe-auth-adapter/compare/v2.1.0...v2.2.0) (2025-06-04)


### Features

* add semantic-release, branch protection and github actions workflows ([d82803a](https://github.com/0xtiby/parse-server-siwe-auth-adapter/commit/d82803a727b42f34c8b44de4beef68907478623f))





## [v2.0.2](https://github.com/0xtiby/parse-server-siwe-auth-adapter/releases/tag/v2.0.2) (2025-04-16)

- Challenge response type 
- Cleanup nonce table function

## [v2.0.0](https://github.com/0xtiby/parse-server-siwe-auth-adapter/releases/tag/v2.0.0) (2025-04-14)

**Breaking Change**: 

- Automatic configuration of the Nonce table for preventReplay has been removed.

**New Feature**: 

- You must now call the exported `setupNonceTable(config)` function after initializing Parse Server when preventReplay is enabled.
- The required schema for the Nonce table is now exported (`NONCE_TABLE_SCHEMA`).

## [1.0.1](https://github.com/0xtiby/parse-server-siwe-auth-adapter/releases/tag/1.0.1) (2024-09-28)



