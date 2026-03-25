import Header from "@/components/Header";
import { Shield } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto flex flex-col items-center justify-center px-4 py-24 text-center">
        <Shield className="mb-6 h-16 w-16 text-primary" />
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground">
          Digital Investigation Platform
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          A comprehensive forensic investigation platform for law enforcement — CDR/IPDR analysis, case management, AI-assisted insights, and court-ready reporting.
        </p>
      </main>
    </div>
  );
};

export default Index;
