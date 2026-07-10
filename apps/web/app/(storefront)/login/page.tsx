"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@components/storefront/AuthForms";

function LoginContent() {
  const searchParams = useSearchParams();
  const defaultEmail = searchParams.get("email") ?? "";
  const redirectTo = searchParams.get("redirectTo") ?? "/cuenta/pedidos";

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Iniciar sesión</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Ingresa tu correo, te enviaremos un código de un solo uso
        </p>
      </div>
      <AuthForm defaultEmail={defaultEmail} redirectTo={redirectTo} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <Suspense>
        <LoginContent />
      </Suspense>
    </main>
  );
}