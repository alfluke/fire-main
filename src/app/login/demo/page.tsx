"use client";

import * as React from "react";
import Prism from "@/components/ui/prism";
import LoginCard from "@/components/ui/login-card";

export default function LoginDemoPage() {
  const [loading, setLoading] = React.useState(false);
  return (
    <div className="relative min-h-screen">
      <Prism animationType="rotate" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/70 to-background/90" />
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <LoginCard
          onSubmit={async () => {
            setLoading(true);
            await new Promise((r) => setTimeout(r, 600));
            setLoading(false);
          }}
          loading={loading}
        />
      </div>
    </div>
  );
}


