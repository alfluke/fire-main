"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Eye, EyeOff, Lock, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const schema = z.object({
  username: z.string().min(1, "Informe o usuário"),
  password: z.string().min(1, "Informe a senha"),
  remember: z.boolean().optional().default(false),
});

export type LoginCardValues = z.infer<typeof schema>;

export type LoginCardProps = {
  onSubmit: (values: LoginCardValues) => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
  defaultValues?: Partial<LoginCardValues>;
};

// Estilo vidro/flutuação: usamos backdrop-blur, borda translúcida e animação sutil
// - A borda usa cor do tema com alpha via utilities/opacity
// - A animação "float" move o card verticalmente de forma leve

export function LoginCard({ onSubmit, loading, error, defaultValues }: LoginCardProps) {
  const [showPassword, setShowPassword] = React.useState(false);
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<LoginCardValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: "",
      password: "",
      remember: false,
      ...defaultValues,
    },
  });

  return (
    <Card
      className="w-full max-w-md rounded-2xl border border-border/50 bg-card/60 transition-transform duration-300 will-change-transform animate-float-y"
      aria-live="polite"
    >
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <CardTitle className="text-2xl font-bold">LOGIN</CardTitle>
        <CardDescription>Bem-vindo de volta</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Wrapper "gelo" translúcido apenas para a área dos campos e botão
            - Fundo: rgba(242,246,250,0.72–0.78) (ajustado para 0.75)
            - Blur: 12–16px (12px aqui)
            - Borda sutil 1px com alpha alto e stroke externo sutil
            - Sombra dupla + inner-glow
            Observação: o fundo não muda em hover/focus; apenas bordas/linhas são realçadas */}
        <div className="rounded-xl bg-[rgba(242,246,250,0.75)] backdrop-blur-[12px] border border-[rgba(255,255,255,0.55)] p-4 md:p-6 
                        shadow-[inset_0_1px_0_rgba(255,255,255,0.6),_0_8px_24px_rgba(0,0,0,0.08),_0_2px_6px_rgba(0,0,0,0.06),_0_0_0_1px_rgba(0,0,0,0.04)] 
                        transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.6),_0_6px_18px_rgba(0,0,0,0.07),_0_1px_4px_rgba(0,0,0,0.05),_0_0_0_1px_rgba(0,0,0,0.04)]">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Campo Usuário com ícone à esquerda e estilo underline */}
          <div>
            <Label htmlFor="username" className="text-sm">Usuário</Label>
            <div className="relative mt-1">
              <User className="absolute left-0 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                {...register("username")}
                id="username"
                placeholder="Seu usuário"
                className="pl-6 border-0 border-b border-input rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none \
                               focus:border-b-2 focus:border-primary bg-transparent"
                aria-invalid={!!errors.username}
                autoComplete="username"
                inputMode="text"
              />
            </div>
            {errors.username && (
              <p className="mt-1 text-xs text-destructive">{errors.username.message}</p>
            )}
          </div>

          {/* Campo Senha com ícone à esquerda e mostrar/ocultar */}
          <div>
            <Label htmlFor="password" className="text-sm">Senha</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-0 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                {...register("password")}
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Sua senha"
                className="pl-6 pr-8 border-0 border-b border-input rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none \
                               focus:border-b-2 focus:border-primary bg-transparent"
                aria-invalid={!!errors.password}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="absolute right-0 top-1.5 p-1 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          {/* Linha de ações: lembrar-me + esqueci minha senha */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Checkbox id="remember" checked={!!watch("remember")} onCheckedChange={(v) => setValue("remember", Boolean(v))} />
              <Label htmlFor="remember" className="text-sm">Lembrar-me</Label>
            </div>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline">Esqueci minha senha?</a>
          </div>

          {/* Botão principal */}
          <Button type="submit" className="w-full h-11 text-base shadow-sm hover:shadow transition-all duration-200" disabled={loading}>
            {loading ? "Entrando..." : "LOGIN"}
          </Button>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          </form>
        </div>
      </CardContent>
      {/* Comentário: O blur de fundo é obtido com backdrop-blur-md; a borda translúcida usa border/50; a animação de flutuação está em animate-[float_6s...] */}
    </Card>
  );
}

export default LoginCard;


