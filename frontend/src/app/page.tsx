import LoginForm1 from "@/components/mvpblocks/login-form1";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background font-sans transition-colors duration-300">
      <ThemeToggle className="absolute top-4 right-4" />
      <LoginForm1 />
    </div>
  );
}
