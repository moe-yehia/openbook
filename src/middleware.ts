import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const APP_PREFIXES = ["/dashboard", "/library", "/upload", "/documents", "/rooms", "/analytics", "/settings"];
const AUTH_PREFIXES = ["/login", "/signup", "/reset-password"];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const inApp = APP_PREFIXES.some((p) => pathname.startsWith(p));
  const inAuth = AUTH_PREFIXES.some((p) => pathname.startsWith(p));

  // Gate the authed workspace.
  if (inApp && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Keep signed-in users out of the auth screens.
  if (inAuth && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on everything except static assets and the OAuth callback/confirm handlers.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|callback|confirm|api/|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico|woff2?)$).*)",
  ],
};
