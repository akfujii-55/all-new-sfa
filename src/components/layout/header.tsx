import { signOut } from "@/actions/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { LogOut } from "lucide-react";
import { MailSyncButton } from "@/components/inbox/mail-sync-button";

export function Header({ user }: { user: { email: string | null; full_name: string | null } }) {
  const name = user.full_name || user.email || "";
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-3 border-b bg-background/80 backdrop-blur px-4 md:px-6">
      <MailSyncButton />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-2">
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline text-sm">{name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="text-sm font-medium">{user.full_name ?? "-"}</div>
            <div className="text-xs text-muted-foreground truncate">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <form action={signOut}>
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <LogOut className="size-4" /> ログアウト
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
