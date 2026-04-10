import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Policy-First Expense Auditor",
  description: "AI-powered corporate expense auditing system ensuring 100% policy compliance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
