import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Architecture } from "@/components/architecture";
import { Security } from "@/components/security";
import { TechStack } from "@/components/tech-stack";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <div className="grain">
      <Nav />
      <Hero />
      <HowItWorks />
      <Architecture />
      <Security />
      <TechStack />
      <Footer />
    </div>
  );
}
