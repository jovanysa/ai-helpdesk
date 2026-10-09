import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
    { reason: 'disliked', label: 'ردود مش مفيدة' },
  ];
  protected readonly satisfaction = signal<{ helpful: number; total: number } | null>(null);
  protected readonly reason = signal<GapReason>('no_answer');
  protected readonly groups = signal<GapGroup[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  private loadRequest?: Subscription;

  /** The key of the question whose answer form is open. */
  protected readonly answering = signal<string | null>(null);
  protected readonly draftTitle = signal('');
  protected readonly draftAnswer = signal('');
  protected readonly saving = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly answerError = signal<string | null>(null);
  protected readonly canSave = computed(
    () =>
      !this.saving() &&
      this.draftTitle().trim().length >= 3 &&
      this.draftAnswer().trim().length >= 5 &&
      this.draftAnswer().trim().length <= 2000,
  );

  ngOnInit(): void {
    this.load();
  }

  protected select(reason: GapReason): void {
    this.reason.set(reason);
    this.answering.set(null);
    this.notice.set(null);
    this.load();
  }

  protected load(): void {
    this.api.satisfaction().subscribe({ next: (value) => this.satisfaction.set(value), error: () => undefined });
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

  protected openAnswer(group: GapGroup): void {
    this.answering.set(group.key);
    // The customer's own wording makes the best title: it is what the next customer will type.
    this.draftTitle.set(group.question);
    this.draftAnswer.set('');
    this.answerError.set(null);
    this.notice.set(null);
  }

  protected percent(value: { helpful: number; total: number }): number {
    // floor: 199 of 200 should read 99%, not a perfect 100%.
    return Math.floor((value.helpful / value.total) * 100);
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected saveAnswer(group: GapGroup, event: Event): void {
    event.preventDefault();
    if (!this.canSave()) return;
    this.saving.set(true);
    this.answerError.set(null);
    const reason = this.reason();
    this.api.answer(reason, group.key, this.draftTitle().trim(), this.draftAnswer().trim()).subscribe({
      next: () => {
        this.saving.set(false);
        this.answering.set(null);
        // The tab may have changed while saving; only touch the list it was saved from.
        if (this.reason() === reason) this.groups.update((groups) => groups.filter((g) => g.key !== group.key));
        this.notice.set('اتضافت الإجابة للمعرفة، والشات هيستخدمها من دلوقتي.');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.answering.set(null);
          this.notice.set('السؤال ده حد تاني جاوبه أو قفله خلاص، فاتحدّثت القايمة.');
          this.load();
          return;
        }
        this.answerError.set(
          error instanceof HttpErrorResponse && error.status === 503
            ? 'الإجابة اتحفظت في ملف المعرفة، بس الفهرس متحدّثش (Ollama شغال؟). اعمل restart للسيرفر.'
            : 'حصل خطأ، راجع العنوان والإجابة وحاول تاني.',
        );
      },
    });
  }
}
