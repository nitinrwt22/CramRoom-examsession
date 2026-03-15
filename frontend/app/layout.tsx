import type { Metadata } from "next";
import { Inter, Playfair_Display, Courier_Prime } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const courier = Courier_Prime({
  weight: ["400", "700"],
  variable: "--font-courier",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CramRoom",
  description: "Collaborative AI-powered exam preparation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${playfair.variable} ${courier.variable} antialiased font-mono transition-colors duration-300`}>
        <div className="bg-texture-overlay"></div>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
