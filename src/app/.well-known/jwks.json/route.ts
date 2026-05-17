import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { LTI_CONFIG } from "@/lib/lti";
import { exportJWK, importSPKI } from "jose";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * JWKS endpoint — expose public key để LTI platform validate JWT token.
 * Trả về JWK set chứa public key.
 */
export async function GET() {
  try {
    const pubPem = readFileSync(LTI_CONFIG.publicKeyPath, "utf8");
    const key = await importSPKI(pubPem, "RS256", { extractable: true });
    const jwk = await exportJWK(key);
    jwk.kid = LTI_CONFIG.keyId;
    jwk.alg = "RS256";
    jwk.use = "sig";
    return NextResponse.json({ keys: [jwk] });
  } catch (err: unknown) {
    console.error("[jwks] error:", errorMessage(err));
    return NextResponse.json(
      { error: "Failed to export JWK" },
      { status: 500 }
    );
  }
}
