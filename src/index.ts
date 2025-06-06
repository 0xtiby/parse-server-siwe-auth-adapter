// Note: do not import Parse dependency. see https://github.com/parse-community/parse-server/issues/6467
/* global Parse */

import { SiweErrorType, SiweMessage, generateNonce } from "siwe";
import { isAddress } from "viem";

export interface AuthData {
  message: string;
  signature: string;
  nonce: string;
  address: string;
}

export interface SiweOptions {
  domain: string;
  statement: string;
  version: string;
  preventReplay: boolean;
  messageValidityInMs: number;
}

export interface SiweAdapterOptions {
  options: SiweOptions;
  module: SiweAdapter;
}

export type SiweChallengeData =
  | {
      responseType: "message";
      address: string;
      uri: string;
      chainId: number;
    }
  | {
      responseType: "nonce-expiration";
    };

const NONCE_TABLE_NAME = "Nonce";

export const NONCE_TABLE_SCHEMA = {
  className: NONCE_TABLE_NAME,
  fields: {
    objectId: { type: "String" },
    createdAt: { type: "Date" },
    updatedAt: { type: "Date" },
    ACL: { type: "ACL" },
    nonce: { type: "String" },
    expirationTime: { type: "Date" },
  },
  classLevelPermissions: {
    find: {},
    count: {},
    get: {},
    create: {},
    update: {},
    delete: {},
    addField: {},
    protectedFields: {},
  },
  indexes: { _id_: { _id: 1 }, nonce_idx: { nonce: 1 } },
};

export class SiweAdapter {
  constructor() {}

  async validateAuthData(authData: AuthData, { options }: SiweAdapterOptions) {
    const { message, signature, nonce } = authData;
    const { domain, statement, version, preventReplay } = options;

    const SIWEObject = new SiweMessage(message);

    if (SIWEObject.domain !== domain) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Invalid domain");
    }
    if (SIWEObject.statement !== statement) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Invalid statement");
    }
    if (SIWEObject.version !== version) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Invalid version");
    }

    try {
      await SIWEObject.verify({
        signature,
        nonce,
      });
      if (preventReplay) {
        const query = new Parse.Query(NONCE_TABLE_NAME);
        query.equalTo("nonce", nonce);
        query.greaterThan("expirationTime", new Date());
        const nonceObject = await query.first({ useMasterKey: true });
        if (!nonceObject) {
          throw SiweErrorType.EXPIRED_MESSAGE;
        }
        await nonceObject.destroy({ useMasterKey: true });
      }
    } catch (error) {
      switch (error) {
        case SiweErrorType.EXPIRED_MESSAGE: {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Message expired");
        }
        case SiweErrorType.INVALID_SIGNATURE: {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Invalid signature");
        }
        default: {
          throw new Parse.Error(
            Parse.Error.OBJECT_NOT_FOUND,
            "Auth failed unknown error"
          );
        }
      }
    }
  }

  async challenge(
    challengeData: SiweChallengeData,
    authData: unknown,
    { options }: SiweAdapterOptions
  ) {
    const { domain, statement, version, preventReplay } = options;
    const nonce = generateNonce();
    const expirationTime = getExpirationTime(options.messageValidityInMs);

    if (challengeData.responseType === "message") {
      if (!Number.isInteger(challengeData.chainId) || challengeData.chainId <= 0) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, "Invalid chainId");
      }

      if (!isAddress(challengeData.address)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, "Invalid Ethereum address");
      }

      if (!challengeData.uri) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, "URI is required");
      }
    }

    if (preventReplay) {
      const nonceObject = new Parse.Object(NONCE_TABLE_NAME);
      nonceObject.set("nonce", nonce);
      nonceObject.set("expirationTime", expirationTime);
      await nonceObject.save({}, { useMasterKey: true });
    }

    if (challengeData.responseType === "nonce-expiration") {
      return {
        nonce,
        expirationTime: expirationTime.toISOString(),
      };
    } else {
      const { address, uri, chainId } = challengeData;
      const message = new SiweMessage({
        domain,
        statement,
        version,
        address,
        nonce,
        uri,
        chainId,
        expirationTime: expirationTime.toISOString(),
      });
      return { message: message.prepareMessage(), nonce };
    }
  }

  validateOptions(options: SiweAdapterOptions): void {
    const { options: siweOptions } = options;
    if (!siweOptions) {
      throw new Error("Options object is required");
    }

    // Validate SiweOptions fields
    if (!siweOptions.domain || typeof siweOptions.domain !== "string") {
      throw new Error("Invalid or missing domain");
    }
    if (!siweOptions.statement || typeof siweOptions.statement !== "string") {
      throw new Error("Invalid or missing statement");
    }
    if (!siweOptions.version || typeof siweOptions.version !== "string") {
      throw new Error("Invalid or missing version");
    }
    if (typeof siweOptions.preventReplay !== "boolean") {
      throw new Error("Invalid or missing preventReplay flag");
    }
    if (
      typeof siweOptions.messageValidityInMs !== "number" ||
      siweOptions.messageValidityInMs <= 0
    ) {
      throw new Error("Invalid or missing message validity time");
    }

    // Validate that module is an instance of SiweAdapter if needed
    // This step is speculative as I don't have the implementation details of SiweAdapter
    if (!(options.module instanceof SiweAdapter)) {
      throw new Error("Module must be an instance of SiweAdapter");
    }
  }

  validateAppId() {
    return Promise.resolve();
  }
}

function getExpirationTime(messageValidityInMs: number) {
  const currentTime = new Date();
  const expirationTime = new Date(currentTime.getTime() + messageValidityInMs);
  return expirationTime;
}

export async function setupNonceTable(): Promise<void> {
  try {
    const schema = new Parse.Schema(NONCE_TABLE_NAME);

    try {
      await schema.get();
      console.log(
        `SIWE-AUTH-ADAPTER: Schema for class ${NONCE_TABLE_NAME} already exists.`
      );
    } catch (getSchemaError: any) {
      console.log(
        `SIWE-AUTH-ADAPTER: Schema for class ${NONCE_TABLE_NAME} not found. Creating...`
      );

      schema.addString("nonce");
      schema.addDate("expirationTime");
      schema.addIndex("nonce_idx", { nonce: 1 });
      schema.setCLP({});

      await schema.save();
      console.log(
        `SIWE-AUTH-ADAPTER: Schema for class ${NONCE_TABLE_NAME} created successfully.`
      );
    }
  } catch (err: any) {
    console.error(
      "SIWE-AUTH-ADAPTER: Error during schema setup for",
      NONCE_TABLE_NAME,
      ":",
      err.message || err
    );
  }
}
export function initializeSiweAdapter(options: SiweOptions) {
  return {
    module: new SiweAdapter(),
    options,
  };
}

export async function cleanupNonceTable() {
  const query = new Parse.Query(NONCE_TABLE_NAME);
  query.lessThan("expirationTime", new Date());
  const expiredNonces = await query.find({ useMasterKey: true });
  await Parse.Object.destroyAll(expiredNonces, { useMasterKey: true });
  return "Expired nonces cleaned";
}
