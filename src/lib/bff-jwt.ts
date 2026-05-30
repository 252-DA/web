import { importPKCS8, SignJWT, type CryptoKey, type JWTPayload } from 'jose';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';

export interface BffClaims extends JWTPayload {
  sub: string;
  courseId?: string;
  roles: string[];
  scope: 'course' | 'admin';
}

let privateKeyPromise: Promise<CryptoKey> | null = null;
let keyId: string = '';

export function loadPrivateKey(): Promise<CryptoKey> {
  if (privateKeyPromise) return privateKeyPromise;

  privateKeyPromise = (async () => {
    const keyPath = process.env.BFF_TO_CORE_PRIVATE_KEY_PATH;
    if (!keyPath) {
      throw new Error('BFF_TO_CORE_PRIVATE_KEY_PATH is not defined');
    }

    keyId = process.env.BFF_TO_CORE_KEY_ID || '';
    if (!keyId) {
      throw new Error('BFF_TO_CORE_KEY_ID is not defined');
    }

    const fullPath = path.resolve(
      /* turbopackIgnore: true */ process.cwd(),
      keyPath,
    );
    try {
      const pem = fs.readFileSync(fullPath, 'utf8');
      return await importPKCS8(pem, 'EdDSA');
    } catch (error) {
      console.error(
        `Failed to load BFF to Core private key from ${keyPath}:`,
        error,
      );
      throw error;
    }
  })();

  return privateKeyPromise;
}

export async function mintCoreJwt(claims: BffClaims) {
  const pk = await loadPrivateKey();

  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'EdDSA', kid: keyId })
    .setIssuer(process.env.BFF_TO_CORE_JWT_ISSUER || 'web-bff')
    .setAudience(process.env.BFF_TO_CORE_JWT_AUDIENCE || 'core-api')
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(pk);
}
