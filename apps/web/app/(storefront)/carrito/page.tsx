import { Carrito } from "@components/storefront/Carrito";

export const metadata = {
  title: "Tu carrito",
};

export default function CarritoPage() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Tu carrito</h1>
      <Carrito />
    </main>
  );
}
