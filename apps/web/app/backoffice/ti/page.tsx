import { redirect } from "next/navigation";

// El módulo TI aterriza en su submódulo Usuarios.
export default function TIPage() {
  redirect("/backoffice/ti/usuarios");
}
