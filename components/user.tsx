"use client";

import Link from "next/link";
import { useUser } from "@/contexts/user-context";
import { signOutAndClearSavedLogin } from "@/lib/auth-client";
import { getInitialsFromName, getUserAvatarSrc } from "@/lib/utils/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserThemeMenuItems } from "@/components/settings/glass-settings";
import { cn } from "@/lib/utils";

export function User({
  className,
  onClick,
  align = "end",
}: {
  className?: string;
  onClick?: () => void;
  align?: "start" | "center" | "end";
}) {
  const { user } = useUser();

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(className, "rounded-full")}
        >
          <Avatar className="size-6">
            <AvatarImage
              src={getUserAvatarSrc(user)}
              alt={user?.name || user.email}
            />
            <AvatarFallback>
              {getInitialsFromName(user.name ?? undefined)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent forceMount align={align} className="max-w-[12.5rem]">
        <DropdownMenuLabel>
          <div className="text-sm font-medium truncate">
            {user.name || user.githubUsername || user.email}
          </div>
          <div className="text-xs font-normal text-muted-foreground truncate">
            {user.email}
          </div>
        </DropdownMenuLabel>
        <UserThemeMenuItems onClick={onClick} />
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">设置</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={async () => {
            if (onClick) onClick();
            await signOutAndClearSavedLogin();
            window.location.assign("/sign-in");
          }}
        >退出登录</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
