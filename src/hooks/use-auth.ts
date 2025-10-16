"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export function useAuth() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const login = async (email: string, password: string) => {
    console.log("🔐 Tentando fazer login com:", email);
    
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    
    console.log("🔐 Resultado do signIn:", result);
    
    if (result?.ok) {
      console.log("✅ Login bem-sucedido, redirecionando...");
      router.push("/");
      return { success: true };
    } else {
      console.log("❌ Login falhou:", result?.error);
      return { 
        success: false, 
        error: "Credenciais inválidas" 
      };
    }
  };

  const logout = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  const register = async (name: string, email: string, password: string) => {
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Após registro, fazer login automaticamente
        return await login(email, password);
      } else {
        return { 
          success: false, 
          error: data.error || "Erro no registro" 
        };
      }
    } catch (error) {
      return { 
        success: false, 
        error: "Erro de conexão" 
      };
    }
  };

  return {
    isAuthenticated: !!session,
    user: session?.user,
    username: session?.user?.name || session?.user?.email,
    isLoading: status === "loading",
    login,
    logout,
    register,
  };
}
