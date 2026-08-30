export function shouldCacheStaticPath(pathname: string, method: string): boolean {
  return (
    method === 'GET' &&
    (pathname.startsWith('/_next/static/') ||
      pathname.startsWith('/icon-') ||
      pathname === '/TVPL.png')
  )
}
