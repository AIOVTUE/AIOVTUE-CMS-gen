import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAccounts } from "@/lib/accounts";
import { UserProvider } from "@/contexts/user-context";
import { AccountsHydrator } from "@/components/accounts-hydrator";
import { User } from "@/types/user";
import { getServerSession } from "@/lib/session-server";
import { isGithubAuthError } from "@/lib/github-auth";
import { hasAdminAccessAsync } from "@/lib/admin";
import { isAppSetupComplete } from "@/lib/app-config/store";

async function AccountsBridge({ user }: { user: User }) {
  let accounts: Awaited<ReturnType<typeof getAccounts>> = [];
  try {
    accounts = await getAccounts(user);
  } catch (error) {
    if (!isGithubAuthError(error)) throw error;
  }
  return <AccountsHydrator accounts={accounts} />;
}

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!(await isAppSetupComplete())) {
    return redirect("/setup");
  }

  const requestHeaders = await headers();
  const session = await getServerSession();
  const returnTo = requestHeaders.get("x-return-to");
  const signInUrl =
    returnTo && returnTo !== "/sign-in"
      ? `/sign-in?redirect=${encodeURIComponent(returnTo)}`
      : "/sign-in";
  if (!session?.user) return redirect(signInUrl);

  const baseUser = {
    ...session.user,
    isAdmin: await hasAdminAccessAsync(session.user as User),
    // undefined = still loading accounts (Suspense bridge)
    accounts: undefined as User["accounts"],
  };

  return (
    <UserProvider user={baseUser}>
      <Suspense fallback={null}>
        <AccountsBridge user={session.user as User} />
      </Suspense>
      {children}
    </UserProvider>
  );
}
