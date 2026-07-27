"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@components/storefront/AuthForms";

function LoginContent() {
  const searchParams = useSearchParams();
  const defaultEmail = searchParams.get("email") ?? "";
  const redirectTo = searchParams.get("redirectTo") ?? "/cuenta/perfil";
  // Lo pone quien nos manda aquí desde un enlace que no se pudo canjear. Antes
  // se escribía en la URL y no se mostraba en ninguna parte, así que el usuario
  // volvía al formulario sin saber qué había pasado.
  const error = searchParams.get("error");

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Iniciar sesión</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Ingresa tu correo, te enviaremos un código de un solo uso
        </p>
      </div>
      {error && (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
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