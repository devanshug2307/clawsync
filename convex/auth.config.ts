/**
 * WorkOS AuthKit Configuration
 *
 * This file configures JWT validation for WorkOS AuthKit.
 * Currently PLACEHOLDER - WorkOS integration not yet set up.
 *
 * When ready to enable:
 * 1. Set WORKOS_CLIENT_ID in Convex environment variables
 * 2. Set WORKOS_API_KEY in Convex environment variables
 * 3. Set WORKOS_REDIRECT_URI to your callback URL
 * 4. Set WORKOS_ENABLED to true below
 * 5. Run `npx convex dev` to sync configuration
 *
 * See: https://docs.convex.dev/auth/authkit/
 */

// Toggle to enable WorkOS authentication
// Set to true when you have configured WorkOS credentials
const WORKOS_ENABLED = false;

/**
 * Auth configuration for WorkOS JWT validation
 *
 * When WORKOS_ENABLED is true, this validates JWTs issued by WorkOS.
 * Two providers are needed to handle both SSO and User Management tokens.
 * 
 * IMPORTANT: Only access process.env.WORKOS_CLIENT_ID when enabled,
 * otherwise Convex will require the env var even when not using it.
 */
function getAuthConfig() {
  if (!WORKOS_ENABLED) {
    return { providers: [] };
  }

  const clientId = process.env.WORKOS_CLIENT_ID;
  if (!clientId) {
    console.warn('WORKOS_CLIENT_ID not set, auth disabled');
    return { providers: [] };
  }

  return {
    providers: [
      // SSO Provider
      {
        type: 'customJwt' as const,
        issuer: 'https://api.workos.com/',
        algorithm: 'RS256' as const,
        applicationID: clientId,
        jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      },
      // User Management Provider
      {
        type: 'customJwt' as const,
        issuer: `https://api.workos.com/user_management/${clientId}`,
        algorithm: 'RS256' as const,
        jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      },
    ],
  };
}

export default getAuthConfig();

/**
 * Environment Variables Required for WorkOS:
 *
 * In Convex Dashboard (Settings > Environment Variables):
 * - WORKOS_CLIENT_ID: Your WorkOS Client ID (client_...)
 * - WORKOS_API_KEY: Your WorkOS API Key (sk_test_... or sk_live_...)
 *
 * In your frontend .env:
 * - VITE_WORKOS_CLIENT_ID: Same as WORKOS_CLIENT_ID
 * - VITE_WORKOS_REDIRECT_URI: http://localhost:5173/callback (dev)
 * - VITE_CONVEX_URL: Your Convex deployment URL
 *
 * Frontend Setup (when ready):
 * 1. npm install @workos-inc/authkit-react
 * 2. Create ConvexClientProvider wrapping AuthKitProvider + ConvexProviderWithAuth
 * 3. Add /callback route to handle OAuth redirects
 * 4. Update SyncBoardAuthGuard to use useAuth() from AuthKit
 */
