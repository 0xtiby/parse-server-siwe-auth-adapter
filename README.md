# SIWE Auth Adapter for Parse Server

The SIWE Auth Adapter integrates seamlessly with Parse Server to enable Ethereum-based authentication using the Sign-In with Ethereum (SIWE) protocol. This adapter facilitates the use of blockchain signatures as a method of authentication.

## Features

- **Ethereum Authentication**: Allow users to sign up and log in using their Ethereum addresses.
- **Nonce Management**: Automatic handling of nonce generation and verification to prevent replay attacks.
- **Customizable Messages**: Supports custom domains, statements, and message expiration settings for SIWE messages.

## Installation

To install the SIWE Auth Adapter, add it to your Parse Server project via npm:

```bash
npm install parse-server-siwe-auth-adapter
```

## Configuration

To use the SIWE Auth Adapter in your Parse Server, configure it in the authentication section of your Parse Server options.

- **domain**: The domain that the message is intended for, acting as an identifier. Example: `"example.com"`.
- **statement**: A human-readable statement for the user to see when signing. Example: `"Sign in with Ethereum to the app."`.
- **version**: The version of the SIWE message format being used. Example: `"1"`.
- **preventReplay**: Boolean flag to enable nonce generation and verification to prevent replay attacks. Example: `true`.
- **messageValidityInMs**: The validity duration of the message in milliseconds. Example: `60000` (which is equivalent to 1 minute).

```ts
const { initializeSiweAdapter } = require("parse-server-siwe-auth-adapter");

const siweOptions = {
  domain: "example.com",
  statement: "Sign in with Ethereum to the app.",
  version: "1",
  preventReplay: true,
  messageValidityInMs: 60000, // 1 minute
};

const siweAdapter = initializeSiweAdapter(siweOptions);

const api = new ParseServer({
  appId: "YOUR_APP_ID",
  masterKey: "YOUR_MASTER_KEY",
  serverURL: "http://localhost:1337/parse",
  auth: {
    siwe: siweAdapter,
  },
});
```

## Usage

This section explains how to integrate SIWE Auth Adapter with your client-side application. The example below shows the complete process from obtaining the SIWE message to authenticating the user via Parse Server.

```ts
const login = async () => {
  const parseUrl = "http://localhost:5001/parse";
  const appId = "yourAppId";
  const address = "0x..."; // User's Ethereum address

  // 1. Get the message to sign
  const challenge = await fetch(`${parseUrl}/challenge`, {
    method: "POST",
    headers: {
      "X-Parse-Application-Id": appId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      challengeData: {
        siwe: {
          address,
          uri: window.location.origin,
          chainId: 1,
        },
      },
    }),
  }).then((res) => res.json());

  // 2. Sign the message
  const signedMessage = await signMessageAsync({
    message: challenge.challengeData.siwe.message,
  });

  // 3. Authenticate with Parse
  const authData = {
    id: address,
    message: challenge.challengeData.siwe.message,
    signature: signedMessage,
    nonce: challenge.challengeData.siwe.nonce,
    address,
  };

  const user = new Parse.User();
  user.set("username", address);
  await user.linkWith("siwe", { authData });
};
```

## Challenge Data

The `challengeData` object is sent to the Parse Server's `/challenge` endpoint to initiate SIWE authentication. It allows users to choose between two methods: receiving a full SIWE message (server-generated) or a nonce with metadata (client-generated).

### Structure

The `challengeData` object must include the following fields under the `siwe` key:

- **address** (`string`): The user's Ethereum address (e.g., `"0x1234567890abcdef1234567890abcdef12345678"`).
- **uri** (`string`): The application's URI (e.g., `"https://example.com/login"`).
- **chainId** (`number`): The Ethereum chain ID (e.g., `1` for Mainnet).
- **responseType** (`string`, optional): Specifies the response type. Options:
  - `"siwe-message"` (default): Server returns a complete SIWE message to sign.
  - `"nonce-expiration"`: Server returns a nonce and metadata for the client to build the SIWE message.

### Response

- **For** `responseType: "siwe-message"`:

  - Returns a fully formatted SIWE message and nonce.
  - Example:

    ```json
    {
      "challengeData": {
        "siwe": {
          "message": "example.com wants you to sign in with your Ethereum account...\nNonce: abc123\nExpiration Time: 2025-04-16T12:01:00.000Z",
          "nonce": "abc123"
        }
      }
    }
    ```

- **For** `responseType: "nonce-expiration"`:

  - Returns a nonce, expiration time, domain, chainId, and uri for the client to construct the SIWE message.
  - Example:

    ```json
    {
      "challengeData": {
        "siwe": {
          "nonce": "abc123",
          "expirationTime": "2025-04-16T12:01:00.000Z",
          "domain": "example.com",
          "chainId": 1,
          "uri": "https://example.com/login"
        }
      }
    }
    ```

### Notes

- Use `"siwe-message"` for simplicity, as the server provides a ready-to-sign message.
- Use `"nonce-expiration"` when the client needs to construct the SIWE message, ensuring `statement` and `version` match the server configuration.
- The server validates all fields for security.

## Prevent Replay Attack

The `preventReplay` option in the SIWE Auth Adapter plays a crucial role in enhancing security by preventing the reuse of authentication messages. When this option is enabled, the adapter performs the following operations:

- **Nonce Generation and Storage**: During the authentication challenge, a unique nonce is generated and stored in a dedicated table (`Nonce`) in the Parse Server's database. This nonce is associated with a specific expiration time, ensuring that it can only be used within a limited timeframe.
- **Nonce Verification**: When a user attempts to authenticate, the adapter checks the provided nonce against the `Nonce` table. It ensures that the nonce is valid, has not expired, and has not been used before. If the nonce meets all criteria, the authentication proceeds, and the nonce is then marked as used by removing it from the table.

### Table setup

If the `preventReplay` option is set to `true`, you **must** manually set up the required `Nonce` table after initializing your Parse Server instance. The adapter exports a function `setupNonceTable` for this purpose. This function requires the Parse Server configuration object for the specific application.

You typically call `setupNonceTable` after your `ParseServer` instance has been created or started. You need to provide the configuration object obtained via `Config.get()`.

Here's an example within an async function that sets up an Express app and Parse Server:

```typescript
import express, { type Express, json } from "express";

import ParseServer from "parse-server";

import { parseConfig } from "./config/parse";

import { registerClasses } from "@workspace/shared/classes";
import { setupNonceTable } from "parse-server-siwe-auth-adapter";
import Config from "parse-server/lib/Config";

export const createServer = async (): Promise<Express> => {
  const app = express();
  const server = new ParseServer(parseConfig);

  await server.start();

  setupNonceTable(Config.get(parseConfig.appId, parseConfig.mountPath));

  return app;
};
```

This function creates the `Nonce` class with the necessary fields (`nonce`, `expirationTime`) and sets appropriate Class-Level Permissions (CLP) to restrict direct client access, ensuring nonce management is handled securely by the server.

For advanced users or for manual schema management, the required schema definition is also exported as `NONCE_TABLE_SCHEMA`.

This approach effectively mitigates the risk of replay attacks, where an attacker could try to reuse a previously intercepted authentication message to gain unauthorized access.

#### Cleanup

You can import the `cleanup` function inside a cloud job to clean up Nonce table.

```typescript
import { cleanupNonceTable } from "parse-server-siwe-auth-adapter";

Parse.Cloud.job("cleanupNonceTable", async (request) => {
  await cleanupNonceTable();
  return "Expired nonces cleaned";
});
```

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues to discuss new features or improvements.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
