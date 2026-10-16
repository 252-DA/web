import { createPublicKey, createVerify } from "crypto";
import {
  createRemoteJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
} from "jose";
import { LTI_CONFIG } from "./lti";

/**
 * Xác minh JWT do platform ký: id_token của mỗi lần launch và các thông báo
 * Platform Notification Service (web/src/app/api/lti/notices). Kiểm tra chữ ký
 * theo JWKS của platform, issuer, audience = client_id của tool và hạn dùng.
 */

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Jwk = {
  kty?: string;
  kid?: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
};
type Jwks = {
  keys?: Jwk[];
};
function isWeakRsaKeyError(error: unknown): boolean {
  return errorMessage(error).includes("modulusLength to be 2048 bits or larger");
}

function allowWeakRsaVerification(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.LTI_ALLOW_WEAK_RSA_VERIFICATION === "true"
  );
}

function assertPlatformClaims(payload: JWTPayload): void {
  if (payload.iss !== LTI_CONFIG.issuer) {
    throw new Error(`Unexpected LTI issuer: ${String(payload.iss || "")}`);
  }

  const audiences = Array.isArray(payload.aud)
    ? payload.aud.map(String)
    : typeof payload.aud === "string"
      ? [payload.aud]
      : [];
  if (!audiences.includes(LTI_CONFIG.clientId)) {
    throw new Error("Unexpected LTI audience");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp !== undefined && now >= Number(payload.exp)) {
    throw new Error("LTI id_token is expired");
  }
  if (payload.nbf !== undefined && now < Number(payload.nbf)) {
    throw new Error("LTI id_token is not active yet");
  }
}

async function fetchPlatformJwks(): Promise<Jwks> {
  const response = await fetch(LTI_CONFIG.jwksUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch platform JWKS: HTTP ${response.status}`);
  }
  const jwks = (await response.json()) as Jwks;
  if (!Array.isArray(jwks.keys)) {
    throw new Error("Platform JWKS is missing keys");
  }
  return jwks;
}

async function verifyWeakRsaPlatformJwt(idToken: string): Promise<JWTPayload> {
  const header = decodeProtectedHeader(idToken);
  if (header.alg !== "RS256") {
    throw new Error(`Unsupported LTI id_token alg: ${String(header.alg || "")}`);
  }

  const jwks = await fetchPlatformJwks();
  const jwk = jwks.keys?.find(
    (key) =>
      key.kty === "RSA" &&
      key.n &&
      key.e &&
      (!header.kid || key.kid === header.kid)
  );
  if (!jwk) {
    throw new Error("No matching RSA key found in platform JWKS");
  }

  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid LTI id_token format");
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();

  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const valid = verifier.verify(publicKey, Buffer.from(parts[2], "base64url"));
  if (!valid) {
    throw new Error("Invalid LTI id_token signature");
  }

  const payload = decodeJwt(idToken);
  assertPlatformClaims(payload);
  return payload;
}

export async function verifyPlatformJwt(idToken: string): Promise<JWTPayload> {
  const platformJwks = createRemoteJWKSet(new URL(LTI_CONFIG.jwksUrl));

  try {
    const { payload } = await jwtVerify(idToken, platformJwks, {
      issuer: LTI_CONFIG.issuer,
      audience: LTI_CONFIG.clientId,
    });
    return payload;
  } catch (error: unknown) {
    if (!isWeakRsaKeyError(error) || !allowWeakRsaVerification()) {
      throw error;
    }

    console.warn(
      "[lti/launch] platform JWKS uses a weak RSA key; using development-only verifier"
    );
    return verifyWeakRsaPlatformJwt(idToken);
  }
}

