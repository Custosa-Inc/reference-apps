import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { clinic } from "@/config";
import { DEMO_USER } from "@/session";
import "./globals.css";

export const metadata: Metadata = {
  title: clinic.name,
  description: "A mock outpatient clinic with synthetic data.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <Link href="/" className="brand">
            {clinic.name}
          </Link>
          <nav>
            <Link href="/">Schedule</Link>
            <Link href="/patients">Patients</Link>
          </nav>
          <span className="user">Signed in as {DEMO_USER.name}</span>
        </header>
        <main>{children}</main>
        <footer>Synthetic data only. Never enter real patient information.</footer>
      </body>
    </html>
  );
}
