import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "個人本棚 | LIB read",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default function LibraryLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
