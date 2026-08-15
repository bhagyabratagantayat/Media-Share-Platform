import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Organisation Event Media & Digital Memories Platform',
  description:
    'A high-performance multi-tenant digital media archive for colleges, universities, companies, and organisations.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[#090d16] text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
