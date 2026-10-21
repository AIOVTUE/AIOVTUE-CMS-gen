import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { clearSavedLoginCredentials } from "@/lib/login-credentials/client-storage";

const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});

export const { emailOtp, signIn, signOut, useSession } = authClient;
export { authClient };

/** Manual sign-out: also clears locally saved login credentials. */
export async function signOutAndClearSavedLogin() {
  clearSavedLoginCredentials();
  try {
    return await signOut();
  } catch (error) {
    clearSavedLoginCredentials();
    throw error;
  }
}
