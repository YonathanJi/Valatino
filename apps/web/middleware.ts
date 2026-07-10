import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/cuenta", "/backoffice"];

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (!isProtected) return NextResponse.next();

  // @supabase/ssr puede partir la cookie en chunks (sb-xxx-auth-token.0, .1…),
  // por eso se usa includes() en lugar de endsWith().
  const allCookies = request.cookies.getAll();
  const hasAuthCookie = allCookies.some(
    (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"),
  );

  if (!hasAuthCookie) {
    // El staff entra por /admin; los clientes por /login.
    const loginPath = pathname.startsWith("/backoffice") ? "/admin" : "/login";
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
