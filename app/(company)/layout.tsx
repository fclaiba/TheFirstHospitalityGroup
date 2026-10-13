import { SignedIn } from "@/components/app/signed-in";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SignedIn>{children}</SignedIn>;
}
