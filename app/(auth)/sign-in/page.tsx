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
  const resolvedSearchParams = await searchParams;
  const rawRedirect = getSafeRedirect(resolvedSearchParams.redirect);
  const fromSetup =
    rawRedirect === "/setup" ||
    resolvedSearchParams.redirect === "/setup";

  const appComplete = await isAppSetupComplete();
  const bootstrapped = await isAdminBootstrapped();
  // hasAuthSecret covers "password step done but email_login row lagging / flaky".
  const configPublic = await getAppConfigPublic().catch(() => null);
  const canSignIn =
    bootstrapped ||
    Boolean(configPublic?.hasAuthSecret && configPublic.adminEmails);

  // No admin yet → setup. If user arrived with redirect=/setup, do NOT bounce
  // back (that caused infinite redirects / "去登录无反应").
  if (!appComplete && !canSignIn && !fromSetup) {
    redirect("/setup");
  }

  if (isLocalDevBypassAuth()) {
    redirect("/");
  }

  const session = await getServerSession();
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

  showGithub = Boolean(
    configPublic?.githubAppClientId && configPublic.hasGithubAppClientSecret,
  );

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
