"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useThemeContext } from "@/context/ThemeContext";
import { Lock, Mail, ShieldAlert, Eye, EyeOff } from "lucide-react";
import { LoginBackground } from "@/components/login/ScoutingBackground";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refreshAdminSession } = useThemeContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await refreshAdminSession();
      // Only internal paths: never redirect to another site
      const next = params.get("next") || "/hub";
      router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/hub");
    } catch (err: any) {
      setError(err.message || "Could not log in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen">
      <LoginBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        <div className="relative w-full max-w-sm">
          {/* Subtle glowing halo behind glass card */}
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-primary/20 via-sky-500/10 to-transparent blur-2xl opacity-60" />

          {/* Glassmorphism Ultra Transparent Card */}
          <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-black/15 p-7 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-md">
            {/* Top accent gloss line */}
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent" />

            {/* Header */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="h-12 w-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-sky-400 backdrop-blur-sm shadow-[0_0_20px_rgba(56,189,248,0.2)] mb-3">
                <ShieldAlert className="w-6 h-6 text-sky-400" />
              </div>
              <h1 className="text-xl font-black tracking-tight text-white drop-shadow-md">
                SPONDA <span className="text-sky-300 text-xs font-semibold px-2 py-0.5 rounded-full bg-white/15 border border-white/25 ml-1">PRO</span>
              </h1>
              <p className="text-xs text-white/80 mt-1 font-medium drop-shadow">
                Elite Women&apos;s Football Intelligence Platform
              </p>
            </div>

            {/* Form */}
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1 text-left">
                <label className="text-[11px] font-semibold tracking-wider uppercase text-white/90 drop-shadow-sm">
                  Work Email
                </label>
                <Input
                  type="email"
                  autoComplete="username"
                  placeholder="name@club.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  leftIcon={<Mail className="w-4 h-4 text-sky-300" />}
                  className="bg-black/20 border-white/25 text-white placeholder:text-white/40 focus-visible:border-sky-300 focus-visible:ring-sky-300/30 backdrop-blur-sm h-10"
                  required
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[11px] font-semibold tracking-wider uppercase text-white/90 drop-shadow-sm">
                  Access Key / Password
                </label>
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  leftIcon={<Lock className="w-4 h-4 text-sky-300" />}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="cursor-pointer text-white/80 hover:text-white transition-colors focus:outline-none p-1.5 rounded hover:bg-white/10"
                      title={showPassword ? "Hide password" : "Show password"}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4 text-sky-300" /> : <Eye className="w-4 h-4 text-sky-300" />}
                    </button>
                  }
                  error={error || undefined}
                  className="bg-black/20 border-white/25 text-white placeholder:text-white/40 focus-visible:border-sky-300 focus-visible:ring-sky-300/30 backdrop-blur-sm h-10"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full h-10 font-bold bg-sky-500/80 hover:bg-sky-500 text-white shadow-lg shadow-sky-500/20 border border-sky-400/40 backdrop-blur-sm transition-all active:scale-[0.99] mt-2"
                isLoading={loading}
              >
                Sign In to Platform
              </Button>
            </form>

            {/* Footer security badge */}
            <div className="mt-6 pt-4 border-t border-white/15 flex items-center justify-center gap-2 text-[10px] text-white/70 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Multi-Tenant Enterprise Protected</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
