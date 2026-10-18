import { AuthProvider } from "../lib/auth";
import Nav from "./nav";
import "./globals.css";

export const metadata = { title: "Sculpt", description: "Workout tracker — web planner" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Nav />
          <div className="page">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
