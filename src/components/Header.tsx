import { Phone, Mail } from "lucide-react";

const Header = () => {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Left - Logo */}
        <div className="flex items-center gap-2">
          <span className="text-2xl font-extrabold tracking-tight text-primary">DIP</span>
          <span className="hidden text-sm text-muted-foreground sm:inline-block">
            Digital Investigation Platform
          </span>
        </div>

        {/* Right - Contact Details */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <a href="tel:+911234567890" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
            <Phone className="h-4 w-4" />
            <span className="hidden sm:inline">+91 12345 67890</span>
          </a>
          <a href="mailto:contact@dip.gov.in" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">contact@dip.gov.in</span>
          </a>
        </div>
      </div>
    </header>
  );
};

export default Header;
