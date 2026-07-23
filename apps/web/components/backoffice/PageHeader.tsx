import Link from "next/link";
import { ChevronLeft, type LucideIcon } from "lucide-react";

interface PageHeaderProps {
  /** Icono Lucide mostrado en un chip con acento de marca. */
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Enlace "volver" opcional, encima del título. */
  back?: { href: string; label: string };
  /** Acciones alineadas a la derecha (botones, badges…). */
  children?: React.ReactNode;
}

export function PageHeader({ icon: Icon, title, description, back, children }: PageHeaderProps) {
  return (
    <div className="mb-6 space-y-3">
      {back && (
        <Link
          href={back.href}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {Icon && (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
