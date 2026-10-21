import { Suspense } from "react";
import { HomePage } from "./home-page";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="text-muted-foreground flex min-h-[calc(100vh-8rem)] items-center justify-center p-6 text-sm">
          正在打开…
        </div>
      }
    >
      <HomePage />
    </Suspense>
  );
}
