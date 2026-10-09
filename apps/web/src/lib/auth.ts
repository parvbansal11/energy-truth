// Sign-in: Amazon Cognito (USER_SRP_AUTH) when the pool is configured, otherwise an explicit demo session.

export type Session = { name: string; email?: string; role: "analyst" | "lender"; method: "cognito" | "demo"; at: number };

const KEY = "et-session";
const poolId = import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;
export const cognitoConfigured = Boolean(poolId && clientId);

export function readSession(): Session | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || "null");
    return s && s.name ? s : null;
  } catch {
    return null;
  }
}

function save(s: Session) {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  return s;
}

export function signOut() {
  try { sessionStorage.removeItem(KEY); } catch {}
  if (cognitoConfigured) import("amazon-cognito-identity-js").then(({ CognitoUserPool }) => new CognitoUserPool({ UserPoolId: poolId!, ClientId: clientId! }).getCurrentUser()?.signOut());
}

export function demoSession(role: Session["role"]): Session {
  return save({ name: role === "analyst" ? "Demo analyst" : "Demo lender", role, method: "demo", at: Date.now() });
}

export async function cognitoSignIn(email: string, password: string, role: Session["role"]): Promise<Session> {
  if (!cognitoConfigured) throw new Error("Cognito is not configured for this build.");
  // loaded on demand: the SDK is only needed when a real user pool exists
  const { AuthenticationDetails, CognitoUser, CognitoUserPool } = await import("amazon-cognito-identity-js");
  const pool = new CognitoUserPool({ UserPoolId: poolId!, ClientId: clientId! });
  const user = new CognitoUser({ Username: email, Pool: pool });
  return new Promise((resolve, reject) => {
    user.authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), {
      onSuccess: () => resolve(save({ name: email.split("@")[0], email, role, method: "cognito", at: Date.now() })),
      onFailure: (e) => reject(new Error(e?.message || "Sign-in failed")),
      newPasswordRequired: () => reject(new Error("Password reset required. Complete it in the Cognito hosted UI.")),
    });
  });
}
