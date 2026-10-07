import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../styles/blank.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://example.com"),
  title: "Next starter",
  description: "A blank Next.js page. The motion toolkit is installed and this page loads none of it.",
  alternates: { canonical: "/" },
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = {
  themeColor: "#f3ecdf",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
