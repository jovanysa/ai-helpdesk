import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Staff pages depend on the visitor's session cookie, so they render in the browser.
  { path: 'staff', renderMode: RenderMode.Client },
  { path: 'staff/**', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Prerender },
];
