import { Nav } from "@/components/landing/nav";
import { Footer } from "@/components/landing/footer";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      {children}
      <Footer />
    </>
  );
}
