import Link from "next/link";
import { Button } from "@components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <p className="text-6xl font-bold text-muted-foreground">404</p>
        <h2 className="font-semibold text-lg">Página no encontrada</h2>
        <p className="text-sm text-muted-foreground">
          La página que buscas no existe o fue movida.
        </p>
        <Button asChild>
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    </div>
  );
}