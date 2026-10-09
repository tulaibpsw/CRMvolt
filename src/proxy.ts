import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIE = 'volton_session'
const PUBLIC_PATHS = ['/login', '/setup', '/privacy', '/api/', '/dev/', '/_next/', '/brand/', '/icons/', '/favicon', '/manifest.webmanifest', '/sw.js', '/offline.html']

/**
 * Optimistic gate only: no cookie → /login. Real checks (valid session, role, scope) happen in
 * requireUser()/requireRole() inside every page, action and service.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname === '/' || PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next()
  if (!request.cookies.get(SESSION_COOKIE)) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/|icons/|sw.js|offline.html|manifest.webmanifest).*)'],
}
