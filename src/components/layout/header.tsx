"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, LogOut, User } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export function AppHeader() {
  const pathname = usePathname();
  const { username, logout, isLoading } = useAuth();

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-8">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <Package className="h-6 w-6 text-primary" />
          <span>{APP_NAME}</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link
            href="/"
            className={cn(
              "text-muted-foreground transition-colors hover:text-foreground",
              pathname === "/" && "text-foreground"
            )}
          >
            Playground
          </Link>
          
          {/* User info and logout */}
          {!isLoading && username && (
            <div className="flex items-center gap-3 ml-4 pl-4 border-l">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>{username}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4 mr-1 bg-red-500 text-white rounded p-0.5" />
                Sair
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
