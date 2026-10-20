import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aura Studio | Vendas e criação com IA",
  description: "Gestão de produtos e criação de imagens de moda com IA no Aura Studio.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
