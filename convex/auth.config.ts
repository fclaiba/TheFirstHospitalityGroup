// Auth provider (ADR 0003, from OSCURA): our own RS256 session tokens, minted by Next.js from the session cookie.
const issuer = process.env.AUTH_ISSUER;

const authConfig = {
  providers: issuer
    ? [
        {
          type: "customJwt",
          issuer,
          jwks: `${issuer}/api/auth/session/jwks`,
          algorithm: "RS256",
          applicationID: "convex",
        },
      ]
    : [],
};

export default authConfig;
