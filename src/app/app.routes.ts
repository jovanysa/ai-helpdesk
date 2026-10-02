import { Routes } from '@angular/router';
import { Chat } from './chat/chat';
import { SupportPage } from './support/support-page';

export const routes: Routes = [
  { path: '', component: Chat },
  { path: 'support/new', component: SupportPage },
];
