import { redirect, unstable_rethrow } from "next/navigation";
import { SetupWizard } from "@/components/setup/setup-wizard";
import {
  getAppConfigPublic,
  isAdminBootstrapped,
  isAppSetupComplete,
  resetAppConfigForSetup,
} from "@/lib/app-config/store";
import { DocumentTitle } from "@/components/document-title";
import { getServerSession } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const params = await searchParams;
  if (params.reset === "1") {
    try {
      await resetAppConfigForSetup();
    } catch {
      // table may not exist yet
    }
    redirect("/setup");
  }

  let initial = null;
  try {
    // Fully ready → leave setup. Do NOT use setupComplete alone (can loop with
    // /sign-in when secrets decrypt fail or GitHub App is still missing).
    if (await isAppSetupComplete()) {
      const session = await getServerSession();
      redirect(session?.user ? "/" : "/sign-in");
    }

    const config = await getAppConfigPublic();
    const bootstrapped = await isAdminBootstrapped();
    const session = await getServerSession();
    // Intentionally no server redirect to /sign-in when bootstrapped:
    // that paired with sign-in's !bootstrapped→/setup caused infinite redirects
    // when the two checks disagreed. Client "去登录" / post-bootstrap assign is enough.
    initial = {
      config: { ...config, setupComplete: false },
      complete: false,
      bootstrapped,
      authenticated: Boolean(session?.user),
    };
  } catch (error) {
    // redirect() throws NEXT_REDIRECT — must not be swallowed.
    unstable_rethrow(error);
    initial = null;
  }

  return (
    <div className="min-h-svh bg-background">
      <DocumentTitle title="初始化" />
      <SetupWizard initial={initial} mode="setup" />
    </div>
  );
}
