import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { Chat } from './chat/chat';
import { SupportPage } from './support/support-page';

export const routes: Routes = [
  { path: '', component: Chat },
  { path: 'support/new', component: SupportPage },
  // Staff pages are lazy-loaded so customers never download them.
  { path: 'staff/login', loadComponent: () => import('./staff/staff-login').then((m) => m.StaffLogin) },
  {
    path: 'staff',
    canActivate: [authGuard],
    children: [
      { path: '', loadComponent: () => import('./staff/ticket-list').then((m) => m.TicketList) },
      { path: 'tickets/:id', loadComponent: () => import('./staff/ticket-detail').then((m) => m.TicketDetail) },
      { path: 'gaps', loadComponent: () => import('./staff/gaps-page').then((m) => m.GapsPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
