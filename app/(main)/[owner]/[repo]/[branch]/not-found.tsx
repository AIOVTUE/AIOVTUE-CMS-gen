import Link from "next/link";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { buttonVariants } from "@/components/ui/button";

/**
 * Repo-scoped 404. Prefer this over the root not-found when a branch path
 * does not match (keeps users inside the project shell when possible).
 */
export default function BranchNotFound() {
  return (
    <Empty className="absolute inset-0 border-0 rounded-none">
      <EmptyHeader>
        <EmptyTitle>页面未找到</EmptyTitle>
        <EmptyDescription>
          找不到该项目下的页面。链接可能已失效，或文件路径含特殊字符未正确编码。
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex flex-wrap items-center justify-center gap-2">
        <Link className={buttonVariants({ variant: "default" })} href="/">
          返回首页
        </Link>
      </EmptyContent>
    </Empty>
  );
}
