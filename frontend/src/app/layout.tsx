import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Delawear PY | Streetwear",
  description: "Explore a coleção Delawear PY. Escolha sua peça e finalize seu pedido pelo WhatsApp.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
