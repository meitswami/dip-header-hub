import Header from "@/components/Header";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container flex flex-col items-center justify-center py-24 text-center">
        <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-foreground">
          Welcome to DIP
        </h1>
        <p className="max-w-md text-lg text-muted-foreground">
          Your trusted partner for quality and excellence. Get in touch with us today.
        </p>
      </main>
    </div>
  );
};

export default Index;
