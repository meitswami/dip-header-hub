import { Phone, Mail } from "lucide-react";

const Header = () => {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <a href="/" className="text-2xl font-extrabold tracking-tight text-foreground">
          DIP
        </a>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <a href="tel:+1234567890" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
            <Phone className="h-4 w-4" />
            <span className="hidden sm:inline">+1 (234) 567-890</span>
          </a>
          <a href="mailto:info@dip.com" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">info@dip.com</span>
          </a>
        </div>
      </div>
    </header>
  );
};

export default Header;
