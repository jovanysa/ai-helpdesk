import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return (await auth.isLoggedIn())
    ? true
    : router.createUrlTree(['/staff/login'], { queryParams: { returnUrl: state.url } });
};
