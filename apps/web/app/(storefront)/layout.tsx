import Link from "next/link";
import { PageTransition } from "@components/ui/PageTransition";

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PageTransition>
        <div className="flex-1">{children}</div>
      </PageTransition>
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>© 2026 Valatino · Sabores de Latinoamérica en España</p>
        <div className="mt-2 flex justify-center gap-4">
          <Link href="/politica-privacidad" className="hover:text-foreground">
            Privacidad
          </Link>
          <Link href="/terminos" className="hover:text-foreground">
            Términos
          </Link>
        </div>
      </footer>
    </div>
  );
}
