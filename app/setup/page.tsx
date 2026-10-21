import { redirect, unstable_rethrow } from "next/navigation";
import { SetupWizard } from "@/components/setup/setup-wizard";
import {
  getAppConfigPublic,
  isAdminBootstrapped,
  isAppSetupComplete,
  resetAppConfigForSetup,
} from "@/lib/app-config/store";
import { DocumentTitle } from "@/components/document-title";

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
    // Fully ready → leave setup.
    if (await isAppSetupComplete()) {
      redirect("/sign-in");
    }

    const config = await getAppConfigPublic();
    const bootstrapped = await isAdminBootstrapped();
    // First-run setup is login-free; session is only needed after setup completes.
    initial = {
      config: { ...config, setupComplete: false },
      complete: false,
      bootstrapped,
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
