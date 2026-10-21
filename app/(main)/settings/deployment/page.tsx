import { redirect } from "next/navigation";
import { MainRootLayout } from "../../main-root-layout";
import { DocumentTitle } from "@/components/document-title";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { hasAdminAccessAsync } from "@/lib/admin";
import {
  getAppConfigPublic,
  isAppSetupComplete,
} from "@/lib/app-config/store";
import { getServerSession } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export default async function DeploymentSettingsPage() {
  const session = await getServerSession();
  const user = session?.user;
  if (!user) throw new Error("User not found");
  if (!(await hasAdminAccessAsync(user))) {
    redirect("/settings");
  }

  const config = await getAppConfigPublic();
  const complete = await isAppSetupComplete();

  return (
    <MainRootLayout title="部署配置" backHref="/settings">
      <DocumentTitle title="部署配置" />
      <SetupWizard initial={{ config, complete }} mode="settings" />
    </MainRootLayout>
  );
}
