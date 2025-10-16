import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "./prisma"
import bcrypt from "bcryptjs"

export const authOptions: NextAuthOptions = {
  // Garante que o secret seja lido do ambiente em produção
  secret: process.env.NEXTAUTH_SECRET,
  // Necessário quando estamos atrás de proxies/CDN (Cloudflare/Vercel)
  trustHost: true,
  // Cookies seguros sob HTTPS para evitar sessão vazia em produção
  cookies: {
    sessionToken: {
      name: "__Secure-next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
      },
    },
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        console.log("🔐 NextAuth authorize chamado com:", credentials?.email);
        
        if (!credentials?.email || !credentials?.password) {
          console.log("❌ Credenciais incompletas");
          return null
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email
          }
        })

        console.log("🔍 Usuário encontrado:", user ? "Sim" : "Não");

        if (!user || !user.password) {
          console.log("❌ Usuário não encontrado ou sem senha");
          return null
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        )

        console.log("🔐 Senha válida:", isPasswordValid);

        if (!isPasswordValid) {
          console.log("❌ Senha inválida");
          return null
        }

        console.log("✅ Autenticação bem-sucedida para:", user.email);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub!
        session.user.role = token.role as string
      }
      return session
    }
  },
  pages: {
    signIn: "/login",
  }
}
