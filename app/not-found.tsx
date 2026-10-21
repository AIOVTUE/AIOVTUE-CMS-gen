import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Empty className="absolute inset-0 border-0 rounded-none">
      <EmptyHeader>
        <EmptyTitle>页面未找到</EmptyTitle>
        <EmptyDescription>找不到您请求的页面或资源。</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link className={buttonVariants({ variant: "default" })} href="/">返回首页</Link>
      </EmptyContent>
    </Empty>
  )
}
