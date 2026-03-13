import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { Problem } from "@/components/problem";
import { ProductDemo } from "@/components/product-demo";
import { ZkProof } from "@/components/zk-proof";
import { PaymentExecution } from "@/components/payment-execution";
import { TechStack } from "@/components/tech-stack";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <div className="grain scanlines">
      <Nav />
      <Hero />
      <Problem />
      <ProductDemo />
      <ZkProof />
      <PaymentExecution />
      <TechStack />
      <Footer />
    </div>
  );
}
