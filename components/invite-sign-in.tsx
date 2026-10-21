"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader } from "lucide-react";
import { toast } from "sonner";
import { signOutAndClearSavedLogin } from "@/lib/auth-client";
import { Button, buttonVariants } from "@/components/ui/button";
import { OtpVerificationForm } from "@/components/otp-verification-form";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

type InviteState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "wrong_account" }
  | { status: "ready"; destinationPath: string }
  | {
      status: "otp_required";
      maskedEmail: string;
      destinationPath: string;
    };

export function InviteSignIn({ token }: { token: string }) {
  const [state, setState] = useState<InviteState>({ status: "loading" });
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState<null | "send" | "verify" | "sign-out">(null);
  const sentOtpForInviteRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      setState({ status: "loading" });
      try {
        const response = await fetch(`/api/collaborator-invites/${encodeURIComponent(token)}`);
        const next = (await response.json()) as InviteState;
        if (!cancelled) setState(next);
      } catch {
        if (!cancelled) setState({ status: "unavailable" });
      }
    }

    void loadInvite();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (state.status === "ready") {
      window.location.assign(state.destinationPath);
    }
  }, [state]);

  useEffect(() => {
    if (state.status !== "otp_required" || sentOtpForInviteRef.current === token) {
      return;
    }

    sentOtpForInviteRef.current = token;
    void sendOtp();
  }, [state, token]);

  async function sendOtp() {
    setPending("send");
    try {
      const response = await fetch(`/api/collaborator-invites/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-otp" }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        toast.error(payload?.message || "无法发送验证码。");
      }
    } catch {
      toast.error("无法发送验证码。");
    } finally {
      setPending(null);
    }
  }

  async function verifyOtp() {
    if (state.status !== "otp_required") return;
    if (otp.length !== 6) {
      toast.error("请输入 6 位验证码。");
      return;
    }

    setPending("verify");
    try {
      const response = await fetch(`/api/collaborator-invites/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify-otp", otp }),
      });
      const claim = (await response.json()) as InviteState & { message?: string };

      if (claim.status === "ready") {
        window.location.assign(claim.destinationPath);
        return;
      }

      if (claim.status === "wrong_account") {
        setState({ status: "wrong_account" });
        setPending(null);
        return;
      }

      toast.error(claim.message || "验证码无效，请重试。");
      setPending(null);
    } catch {
      toast.error("无法验证验证码。");
      setPending(null);
    }
  }

  const shellClassName = "absolute inset-0 border-0 rounded-none";

  if (state.status === "loading" || state.status === "ready") {
    return (
      <Empty className={shellClassName}>
        <Loader className="size-5 animate-spin text-muted-foreground" />
      </Empty>
    );
  }

  if (state.status === "unavailable") {
    return (
      <Empty className={shellClassName}>
        <EmptyHeader>
          <EmptyTitle>邀请不可用</EmptyTitle>
          <EmptyDescription>This invitation is no longer available.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/sign-in" className={buttonVariants()}>
            Sign in
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  if (state.status === "wrong_account") {
    return (
      <Empty className={shellClassName}>
        <EmptyHeader>
          <EmptyTitle>账号不匹配</EmptyTitle>
          <EmptyDescription>This invitation was sent to another account.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            disabled={pending !== null}
            onClick={async () => {
              setPending("sign-out");
              try {
                await signOutAndClearSavedLogin();
                window.location.reload();
              } finally {
                setPending(null);
              }
            }}
          >退出登录
            {pending === "sign-out" && <Loader className="size-4 animate-spin" />}
          </Button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>返回首页</Link>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <Empty className={shellClassName}>
      <EmptyContent>
        <div className="w-full max-w-[340px]">
          <OtpVerificationForm
            busy={pending !== null}
            emailLabel={state.maskedEmail}
            otp={otp}
            pending={pending === "verify"}
            resendDisabled={pending === "verify"}
            resendPending={pending === "send"}
            onChange={setOtp}
            onResend={() => void sendOtp()}
            onSignInAnotherWay={() => {
              window.location.assign(`/sign-in?redirect=${encodeURIComponent(`/sign-in/collaborator?token=${token}`)}`);
            }}
            onSubmit={(event) => {
              event.preventDefault();
              void verifyOtp();
            }}
          />
        </div>
      </EmptyContent>
    </Empty>
  );
}
