"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { MomentsTab } from "@/components/moments/moments-tabs";

const MomentsApiManager = dynamic(
  () =>
    import("@/components/moments/moments-api-manager").then(
      (m) => m.MomentsApiManager,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 flex-col gap-3 p-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    ),
  },
);

export function MomentsPageClient() {
  const [activeTab, setActiveTab] = useState<MomentsTab>("posts");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MomentsApiManager
        canCreate
        canDelete
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </div>
  );
}
