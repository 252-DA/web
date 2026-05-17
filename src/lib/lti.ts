export type LmsType = "openedx" | "moodle" | "canvas";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function lmsTypeFromEnv(): LmsType {
  const value = env("LTI_LMS_TYPE");
  if (value === "moodle" || value === "canvas") {
    return value;
  }
  return "openedx";
}

const lmsType = lmsTypeFromEnv();
const platformUrl = withoutTrailingSlash(
  env("LTI_PLATFORM_URL") || "http://local.edly.io"
);
const issuer = withoutTrailingSlash(
  env("LTI_ISSUER_URL") ||
    (lmsType === "canvas" ? "https://canvas.instructure.com" : platformUrl)
);

function defaultAuthUrl(): string {
  if (lmsType === "moodle") {
    return `${platformUrl}/mod/lti/auth.php`;
  }
  if (lmsType === "canvas") {
    return "https://sso.canvaslms.com/api/lti/authorize_redirect";
  }
  return `${platformUrl}/oauth2/authorize`;
}

function defaultJwksUrl(): string {
  if (lmsType === "moodle") {
    return `${platformUrl}/mod/lti/certs.php`;
  }
  if (lmsType === "canvas") {
    return "https://sso.canvaslms.com/api/lti/security/jwks";
  }
  return `${platformUrl}/oauth2/jwks`;
}

function defaultTokenUrl(): string {
  if (lmsType === "moodle") {
    return `${platformUrl}/mod/lti/token.php`;
  }
  if (lmsType === "canvas") {
    return `${platformUrl}/login/oauth2/token`;
  }
  return `${platformUrl}/oauth2/access_token`;
}

export const LTI_CONFIG = {
  lmsType,
  issuer,
  platformUrl,
  keyId: process.env.LTI_KEY_ID || "ai-nextjs-1",
  clientId: process.env.LTI_CLIENT_ID || process.env.LTI_KEY_ID || "ai-nextjs-1",
  privateKeyPath: process.env.LTI_PRIVATE_KEY_PATH || "keys/lti.pem",
  publicKeyPath: process.env.LTI_PUBLIC_KEY_PATH || "keys/lti.pub.pem",
  redirectUri: process.env.LTI_REDIRECT_URI || "http://localhost:3000/lti/launch",
  authUrl: withoutTrailingSlash(env("LTI_AUTH_URL") || defaultAuthUrl()),
  jwksUrl: withoutTrailingSlash(env("LTI_JWKS_URL") || defaultJwksUrl()),
  tokenUrl: withoutTrailingSlash(env("LTI_TOKEN_URL") || defaultTokenUrl()),
  deploymentId: env("LTI_DEPLOYMENT_ID") || "",
};

export const LTI_LOGIN_PATH = "/lti/login";
export const LTI_LAUNCH_PATH = "/lti/launch";
