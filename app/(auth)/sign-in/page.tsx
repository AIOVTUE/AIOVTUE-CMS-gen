import { redirect } from "next/navigation";
import { SignIn } from "@/components/sign-in";
import { getSafeRedirect } from "@/lib/auth-redirect";
import {
  getAppConfigPublic,
  isAdminBootstrapped,
  isAppSetupComplete,
} from "@/lib/app-config/store";
import { isLocalDevBypassAuth } from "@/lib/local-repo/config";
import { getServerSession } from "@/lib/session-server";
import {
  DEFAULT_LOGIN_BG_DESKTOP,
  DEFAULT_LOGIN_BG_MOBILE,
  DEFAULT_PRIMARY_COLOR,
  getLoginBackgroundPublic,
} from "@/lib/login-background/settings";
import { SignInTheme } from "@/components/sign-in-theme";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const appComplete = await isAppSetupComplete();
  const bootstrapped = await isAdminBootstrapped();

  // No admin yet → first setup step. Bootstrapped but incomplete → allow login.
  if (!appComplete && !bootstrapped) {
    redirect("/setup");
  }

  if (isLocalDevBypassAuth()) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;
  const session = await getServerSession();
  const rawRedirect = getSafeRedirect(resolvedSearchParams.redirect);
  const safeRedirect =
    !appComplete && rawRedirect === "/" ? "/setup" : rawRedirect;

  if (session?.user) {
    if (safeRedirect === "/sign-in") {
      return redirect(appComplete ? "/" : "/setup");
    }
    return redirect(safeRedirect);
  }

  let desktopBg = DEFAULT_LOGIN_BG_DESKTOP;
  let mobileBg = DEFAULT_LOGIN_BG_MOBILE;
  let primaryColor = DEFAULT_PRIMARY_COLOR;
  let showGithub = false;
  try {
    const background = await getLoginBackgroundPublic();
    desktopBg = background.desktopUrl;
    mobileBg = background.mobileUrl;
    primaryColor = background.primaryColor;
  } catch (error) {
    console.error("Failed to load login background settings:", error);
  }

  try {
    const config = await getAppConfigPublic();
    showGithub = Boolean(
      config.githubAppClientId && config.hasGithubAppClientSecret,
    );
  } catch {
    showGithub = false;
  }

  return (
    <>
      <SignInTheme primaryColor={primaryColor} />
      <SignIn
        desktopBg={desktopBg}
        mobileBg={mobileBg}
        showGithub={showGithub}
      />
    </>
  );
}
