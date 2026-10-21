import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { User } from "@/components/user";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "@/components/app-shell-backdrop.css";
import "./main-root-layout.css";

export function MainRootLayout({
  children,
  title,
  backHref,
  backLabel = "返回",
}: {
  children: React.ReactNode;
  title?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  /** @deprecated Kept for call-site compatibility; no longer used for header layout. */
  contentMaxWidth?: "sm" | "lg";
}) {
  return (
    <div className="main-root-shell relative flex min-h-screen flex-col">
      <div className="app-shell-backdrop" aria-hidden>
        <div className="app-shell-backdrop__image" />
      </div>
      <header className="main-root-shell__header fixed inset-x-0 top-0 z-50 border-b">
        <div className="flex min-h-11 w-full items-center gap-3 px-3 py-1.5 lg:min-h-14 lg:gap-4 lg:px-6 lg:py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            {title != null ? (
              typeof title === "string" ? (
                <strong className="block truncate text-[0.9375rem] font-bold leading-tight text-foreground">
                  {title}
                </strong>
              ) : (
                title
              )
            ) : null}
            {backHref ? (
              <Link
                className={cn(
                  buttonVariants({ variant: "outline", size: "xs" }),
                  "inline-flex shrink-0",
                )}
                href={backHref}
              >
                <ArrowLeft />
                {backLabel}
              </Link>
            ) : null}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <User align="end" />
          </div>
        </div>
      </header>
      <main className="main-root-shell__main relative z-[1] w-full flex-1 pt-14 lg:pt-16">
        {children}
      </main>
    </div>
  );
}
