import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { GapGroup, GapReason, GapsApi } from '../gaps/gaps-api';

/** Questions the chat could not answer, most asked first, so staff can add the answers to knowledge/. */
@Component({
  selector: 'app-gaps-page',
  imports: [RouterLink, DatePipe],
  templateUrl: './gaps-page.html',
  styleUrl: './gaps-page.scss',
})
export class GapsPage implements OnInit {
  private readonly api = inject(GapsApi);

  protected readonly tabs: { reason: GapReason; label: string }[] = [
    { reason: 'no_answer', label: 'معندوش المعلومة' },
    { reason: 'off_topic', label: 'اترفضت كبرّه الجمعية' },
  ];
  protected readonly reason = signal<GapReason>('no_answer');
  protected readonly groups = signal<GapGroup[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  private loadRequest?: Subscription;

  ngOnInit(): void {
    this.load();
  }

  protected select(reason: GapReason): void {
    this.reason.set(reason);
    this.load();
  }

  protected load(): void {
    // A slower answer for the previous tab must never land under the new one.
    this.loadRequest?.unsubscribe();
    this.groups.set([]);
    this.loading.set(true);
    this.loadRequest = this.api.list(this.reason()).subscribe({
      next: (groups) => {
        this.groups.set(groups);
        this.failed.set(false);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected resolve(group: GapGroup): void {
    this.failed.set(false);
    this.api.resolve(this.reason(), group.key).subscribe({
      next: ({ resolved }) => {
        // Only drop the row when the server really marked it handled.
        if (resolved > 0) this.groups.update((groups) => groups.filter((g) => g.key !== group.key));
        else this.load();
      },
      error: () => this.failed.set(true),
    });
  }
}
