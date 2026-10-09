# تمارين: جرّب بإيدك

دي 3 تمارين حقيقية على المشروع، **مش محلولة**. كل تمرين فيه:
- المكان اللي هتشتغل فيه.
- اختبار تبدأ بيه، يعني تكتب الاختبار الأول وتشوفه بيفشل، وبعدين تكتب الكود.
- تلميحات لو وقفت.

بعد كل تمرين:

```bash
npx ng test --watch=false   # كل الاختبارات لازم تنجح
npm run build               # الـ build لازم ينجح
```

---

## تمرين 1 (Angular): عدد الأسئلة المفتوحة على اللينك

**المطلوب:** في صفحة التذاكر (`/staff`)، لينك "أسئلة مالهاش إجابة" يبقى جنبه رقم بعدد الأسئلة المفتوحة. مثلًا `أسئلة مالهاش إجابة (3)`. ولو مفيش أسئلة، الرقم ميظهرش.

**هتشتغل في:**
- `src/app/staff/ticket-list.ts` و `ticket-list.html`
- `src/app/gaps/gaps-api.ts`: فيه `list(reason)` جاهزة

**ابدأ بالاختبار ده** في `src/app/staff/ticket-list.spec.ts`:

```ts
it('shows how many questions are waiting for an answer', async () => {
  const { fixture, http, element } = await setup();
  http.expectOne('/api/tickets').flush([]);
  http.expectOne((r) => r.url === '/api/gaps').flush([{ key: 'a' }, { key: 'b' }, { key: 'c' }]);
  await fixture.whenStable();
  expect(element.querySelector('a[href="/staff/gaps"]')?.textContent).toContain('(3)');
});
```

**تلميحات:**
- اعمل `signal<number>(0)`، وحدّثه من `GapsApi.list('no_answer')` في `ngOnInit`.
- في الـ template: `@if (openGaps() > 0) { ({{ openGaps() }}) }`.
- فكّر: لو الطلب ده فشل، المفروض الصفحة كلها تبوظ؟ ولا الرقم ميظهرش وخلاص؟

---

## تمرين 2 (السيرفر و TDD): `##` جوه code block

**المشكلة:** `parseKnowledgeFile` بيبدأ جزء جديد عند أي سطر بيبدأ بـ `## `، حتى لو السطر ده جوه code block (بين ` ``` ` و ` ``` `). فلو موظف حط مثال markdown في ملف المعرفة، الجزء هيتقسم غلط.

**هتشتغل في:** `src/server/knowledge-chunks.ts`

**ابدأ بالاختبار ده** في `src/server/knowledge-chunks.spec.ts`:

```ts
it('ignores ## lines inside a code block', () => {
  const md = '## مثال\nاكتب كده:\n```\n## ده مش عنوان\n```\nخلاص';
  expect(parseKnowledgeFile('x.md', md)).toEqual([
    { file: 'x.md', title: 'مثال', content: 'اكتب كده:\n```\n## ده مش عنوان\n```\nخلاص' },
  ]);
});
```

**تلميحات:**
- متغيّر `inFence` بيتقلب كل ما سطر يبدأ بـ ` ``` `.
- طول ما `inFence` قيمته `true`، السطر بيتضاف للمحتوى وخلاص، حتى لو بيبدأ بـ `## `.
- شغّل الاختبار **قبل** ما تكتب الكود، واتأكد إنه بيفشل للسبب الصح.

---

## تمرين 3 (الـ AI): 👍 / 👎 تحت رد الشات

**المطلوب:** تحت كل رد من الـ assistant يبقى فيه زرارين 👍 و 👎. والتقييم يتسجّل في الداتابيز ومعاه السؤال والرد، علشان نعرف الردود الضعيفة فين.

**هتلمس:**
1. **`src/server/db.ts`:** جدول `reply_feedback`، وفيه `id` و `question` و `reply` و `helpful` (0 أو 1) و `created_at`.
2. **repository صغير**، زي `UnansweredRepository`، ومعاه اختبار بـ `openDatabase(':memory:')`.
3. **route عام** `POST /api/feedback` في `src/server/api-routes.ts`، وتعمله `staffOnly: false`. وخلي بالك إن الاختبار اللي اسمه "keeps only the customer and login endpoints public" **لازم تحدّثه**، وفكّر ليه.
4. **`src/app/chat/chat.html`:** الزرارين يظهروا بس بعد ما الرد يخلص، ويختفوا بعد أول ضغطة.

**تلميحات:**
- الـ endpoint ده عام، يعني أي حد يقدر يبعتله. حط حد لطول النص (زي ما عملنا في `UnansweredRepository.record`).
- في الـ test، اتأكد إن الطلب بيبعت `question` و `reply` و `helpful`.
- **سؤال للتفكير:** هل الأحسن تقيّم بالـ 👎 الأسئلة اللي الشات قال فيها "مش عارف"؟ ولا دي أصلًا متسجّلة في صفحة الأسئلة اللي مالهاش إجابة؟

---

لما تخلص تمرين، ابعتلي الـ diff (`git diff`) وأنا أراجعه معاك.
