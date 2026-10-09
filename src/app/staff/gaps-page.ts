import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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

  ngOnInit(): void {
    this.load();
  }

  protected select(reason: GapReason): void {
    this.reason.set(reason);
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.list(this.reason()).subscribe({
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
    this.api.resolve(this.reason(), group.key).subscribe({
      next: () => this.groups.update((groups) => groups.filter((g) => g.key !== group.key)),
      error: () => this.failed.set(true),
    });
  }
}
