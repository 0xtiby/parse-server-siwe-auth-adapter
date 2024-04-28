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
- **applicationId**: The application ID for which the adapter is configured, typically the Parse Server application ID. Example: `"YOUR_APP_ID"`.
- **mounthPath**: The path where the Parse Server is mounted. Example: `"/parse"`.

```ts
const { initializeSiweAdapter } = require("parse-server-siwe-auth-adapter");

const siweOptions = {
  domain: "example.com",
  statement: "Sign in with Ethereum to the app.",
  version: "1",
  preventReplay: true,
  messageValidityInMs: 60000, // 1 minute
  applicationId: "YOUR_APP_ID",
  mounthPath: "/parse",
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

## Prevent Replay Attack

The `preventReplay` option in the SIWE Auth Adapter plays a crucial role in enhancing security by preventing the reuse of authentication messages. When this option is enabled, the adapter performs the following operations:

- **Nonce Generation and Storage**: During the authentication challenge, a unique nonce is generated and stored in a dedicated table (`Nonce`) in the Parse Server's database. This nonce is associated with a specific expiration time, ensuring that it can only be used within a limited timeframe.
- **Nonce Verification**: When a user attempts to authenticate, the adapter checks the provided nonce against the `Nonce` table. It ensures that the nonce is valid, has not expired, and has not been used before. If the nonce meets all criteria, the authentication proceeds, and the nonce is then marked as used by removing it from the table.

### Table setup

The `Nonce` table is set up automatically with fields for the nonce string and its expiration time when the option `preventReplay` is set to `true`. Class-Level Permissions (CLP) are configured to restrict direct access to this table, ensuring that nonce management is securely handled through server-side logic.

This approach effectively mitigates the risk of replay attacks, where an attacker could try to reuse a previously intercepted authentication message to gain unauthorized access.

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues to discuss new features or improvements.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
