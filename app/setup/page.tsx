import { redirect, unstable_rethrow } from "next/navigation";
import { SetupWizard } from "@/components/setup/setup-wizard";
import {
  getAppConfigPublic,
  isAdminBootstrapped,
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
    const config = await getAppConfigPublic();
    // Only treat DB setup_complete as done — ignore LOCAL_DEV_BYPASS_AUTH.
    if (config.setupComplete) {
      redirect("/sign-in");
    }
    const bootstrapped = await isAdminBootstrapped();
    const session = await getServerSession();
    if (bootstrapped && !session?.user) {
      redirect(`/sign-in?redirect=${encodeURIComponent("/setup")}`);
    }
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
