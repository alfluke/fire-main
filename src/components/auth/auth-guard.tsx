"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  console.log("🛡️ AuthGuard - Status:", status, "Session:", !!session, "Path:", pathname);

  useEffect(() => {
    // Não aplicar proteção na página de login
    if (pathname === "/login") {
      console.log("🛡️ Na página de login, não aplicando proteção");
      return;
    }

    // Se não estiver carregando e não há sessão, redirecionar para login
    if (status === "unauthenticated") {
      console.log("🛡️ Usuário não autenticado, redirecionando para login");
      router.push("/login");
    }
  }, [session, status, pathname, router]);

  // Se estiver na página de login, renderizar normalmente
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // Mostrar loading enquanto verifica autenticação
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  // Se não estiver autenticado, não renderizar nada (será redirecionado)
  if (status === "unauthenticated") {
    return null;
  }

  return <>{children}</>;
}
