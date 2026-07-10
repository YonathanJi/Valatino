import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@lib/supabase/server";

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const redirectTo = request.nextUrl.searchParams.get("redirectTo") ?? "/cuenta/pedidos";

  const supabase = createSupabaseServerClient();

  // Flujo PKCE (code exchange)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const url = new URL("/login", origin);
      url.searchParams.set("error", error.message);
      return NextResponse.redirect(url);
    }
    const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/cuenta/pedidos";
    return NextResponse.redirect(new URL(safeRedirect, origin));
  }

  // Flujo token_hash (otp email recovery)
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "email" | "recovery" | "signup",
    });
    if (error) {
      const url = new URL("/login", origin);
      url.searchParams.set("error", error.message);
      return NextResponse.redirect(url);
    }
    const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/cuenta/pedidos";
    return NextResponse.redirect(new URL(safeRedirect, origin));
  }

  // Sin parámetros: redirigir a login
  return NextResponse.redirect(new URL("/login", origin));
}