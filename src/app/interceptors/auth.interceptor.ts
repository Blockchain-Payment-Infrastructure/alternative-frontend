import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getAccessToken();

  // Get the URL path (handle both absolute and relative URLs)
  const url = req.url.startsWith('http') ? new URL(req.url).pathname : req.url;
  
  // Skip auth endpoints and public routes
  const isAuthRoute = url.includes('/auth/');
  const isPublicRoute = url === '/health' || url === '/' || url.endsWith('/health');

  // Add token to all non-auth, non-public routes if token exists
  if (token && !isAuthRoute && !isPublicRoute) {
    const cloned = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    return next(cloned);
  }

  // If no token but trying to access protected route, still proceed (backend will return 401)
  return next(req);
};

