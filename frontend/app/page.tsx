import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/sections/Hero";
import { Workflow } from "@/components/sections/Workflow";
import { Reviews } from "@/components/sections/Reviews";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col font-sans transition-colors duration-300">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <Workflow />
        <Reviews />
      </main>
      <Footer />
    </div>
  );
}
