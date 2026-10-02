# المرحلة 1: شات AI لخدمة عملاء جمعية خيرية — Design Spec

- **التاريخ:** 2026-10-02
- **الحالة:** متوافق عليه في المحادثة، ومستني مراجعة الملف ده

## 1. الهدف

- **ليه:** مشروع تعليمي علشان تتعلم Angular والـ AI. Claude بيكتب الكود ويشرح كل جزء، وإنت (المطوّر) تراجع وتعدّل.
- **إيه:** صفحة شات بيرد فيها مساعد AI على أسئلة الناس عن جمعية خيرية وهمية اسمها **"جمعية الخير / Al-Khair Foundation"**: التبرع، والتطوع، وطلب المساعدة.
- **النجاح معناه:**
  1. تكتب سؤال بالعربي أو الإنجليزي، والرد يظهر **كلمة كلمة** بنفس اللغة.
  2. الرد مبني على معلومات الجمعية اللي في الـ system prompt.
  3. زرار "إيقاف" بيوقف الرد في النص من غير ما يطلع خطأ.
  4. لو Ollama مش شغال، تظهر رسالة واضحة بدل ما الصفحة تهنج.
  5. الاختبارات تعدّي بـ `npm test` من غير ما Ollama يبقى شغال.

## 2. برّه نطاق المرحلة دي (مراحل جاية)

- داتابيز وحفظ المحادثات: المحادثة بتتمسح مع الـ refresh.
- Login وحسابات.
- التذاكر (Tickets) وصفحة الموظفين: المرحلة 2.
- قاعدة معرفة (RAG): المرحلة 3.
- مكتبات AI جاهزة زي `ollama-js` أو LangChain.

## 3. البيئة والقيود

- Mac M1 فيه **8GB RAM**، فلازم نستخدم موديل صغير.
- الموديل: **`qwen2.5:3b`** على Ollama (`http://localhost:11434`)، حجمه حوالي 2GB، وبيدعم العربي والإنجليزي.
- المشروع Angular 22 فيه SSR وExpress في `src/server.ts`. الـ `ng serve` بيمرّر الـ requests لـ Express، فالـ `/api/chat` هيشتغل في وضع التطوير.
- مفيش dependencies جديدة: هنستخدم `fetch` الموجودة في Node والمتصفح.
- الإعدادات بتتقرا من environment variables، ولو مش موجودة بنستخدم القيم الافتراضية: `OLLAMA_URL` (`http://localhost:11434`) و `OLLAMA_MODEL` (`qwen2.5:3b`).

## 4. Architecture

```
Angular (المتصفح) ──POST /api/chat──▶ Express ──POST /api/chat (stream)──▶ Ollama
                  ◀──SSE (حتة حتة)──          ◀──NDJSON (حتة حتة)──
```

1. الـ Angular يبعت `{ messages: ChatMessage[] }`، وفيها **آخر 10 رسايل** بس.
2. Express يتحقق من الطلب، ويحط الـ system prompt في الأول، ويبعت لـ Ollama ومعاه `stream: true`.
3. Ollama بيرجّع NDJSON: كل سطر فيه object زي `{ message: { content }, done }`.
4. Express يحوّل كل سطر لـ SSE event ويبعته على طول.
5. الـ Angular يقرأ `response.body` حتة حتة ويحدّث الـ Signals.

### شكل الـ SSE اللي بيطلع من `/api/chat`

```
data: {"type":"token","text":"أهلًا"}

data: {"type":"done"}

data: {"type":"error","message":"..."}
```

- `Content-Type: text/event-stream`
- لو الطلب غلط، بيرجع `400` مع JSON عادي، ومفيش stream.
- لو Ollama مش متاح **قبل** ما الـ stream يبدأ، بيرجع `503` مع `{ error }`.
- لو حصل خطأ **بعد** ما الـ stream بدأ، بيتبعت event من نوع `error` والاتصال يتقفل.
- لو العميل قفل الاتصال، السيرفر يلغي الطلب اللي رايح لـ Ollama (بـ `AbortController`).

## 5. الملفات

### السيرفر (`src/server/`)

| الملف | دوره |
|---|---|
| `charity-prompt.ts` | `CHARITY_SYSTEM_PROMPT`: معلومات الجمعية والقواعد. |
| `ai-provider.ts` | الـ interface `AiProvider { streamChat(messages, signal): AsyncIterable<string> }`، والـ class `OllamaProvider` اللي بيطبّقه، وفيه قراءة الـ NDJSON. **ده المكان الوحيد اللي هيتغيّر لو غيّرنا الموديل.** |
| `chat-route.ts` | `createChatRouter(provider)`: فيه التحقق من الطلب، والـ SSE، والأخطاء. بياخد الـ provider كـ parameter علشان نقدر نختبره بـ provider وهمي. |
| `src/server.ts` | تعديل صغير: `app.use(express.json())` و `app.use('/api', createChatRouter(new OllamaProvider()))` قبل الـ static والـ Angular handler. |

**قواعد التحقق:** `messages` لازم تكون array فيها من 1 لـ 10 عناصر. كل `role` لازم يكون `'user'` أو `'assistant'`، وكل `content` يكون string مش فاضي وطوله ≤ 2000 حرف. وآخر رسالة لازم تكون من `user`.

### الـ Angular (`src/app/chat/`)

| الملف | دوره |
|---|---|
| `message.model.ts` | `ChatMessage = { role: 'user' \| 'assistant'; content: string }` |
| `sse-parser.ts` | function بسيطة بتحوّل النص اللي جاي حتة حتة لـ events. لازم تتعامل مع إن event واحد ممكن يتقسم على حتتين. |
| `chat.service.ts` | `providedIn: 'root'`. فيه الـ signals دي (للقراءة بس من برّه): `messages` و `isStreaming` و `error`. وفيه `send(text)` و `stop()`. |
| `chat.ts` / `.html` / `.scss` | الشاشة. بتعرض الـ signals بس، ومفيهاش logic. |
| `app.routes.ts` | `{ path: '', component: Chat }` |
| `app.html` | يتمسح محتواه الافتراضي ويفضل فيه `<router-outlet />` بس. |

### سلوك `send(text)`

1. يتجاهل الطلب لو `text.trim()` فاضي أو `isStreaming()` قيمتها true.
2. يضيف رسالة `user`، وبعدها رسالة `assistant` فاضية. ويخلي `isStreaming = true` و `error = null`.
3. يعمل `fetch` بـ POST ومعاه `AbortController`، ويبعت آخر 10 رسايل (من غير الرسالة الفاضية).
4. مع كل event من نوع `token`، يزوّد النص على آخر رسالة بـ `messages.update`.
5. في الآخر: `isStreaming = false`.
   - لو حصل `AbortError` (المستخدم داس إيقاف): مفيش خطأ.
   - لو حصل خطأ في الشبكة أو `503` أو event من نوع `error`: `error = 'خدمة المساعد غير متاحة حاليًا، حاول تاني.'`
   - لو رسالة الـ assistant فضلت فاضية بعد خطأ، تتشال.

### الشاشة

- Header فيه اسم الجمعية.
- تلات اقتراحات سريعة بتظهر لما الشات يكون فاضي: "أتبرع إزاي؟" و "عايز أتطوع" و "محتاج مساعدة".
- كل رسالة عليها `dir="auto"`. رسايل المستخدم في ناحية ورسايل المساعد في الناحية التانية، والـ assistant بيبان آخره مؤشر ▌ وهو بيكتب.
- الصفحة تنزل لوحدها لآخر رسالة مع كل تحديث.
- خانة الكتابة عليها `maxlength=2000`، و Enter بيبعت.
- زرار "إرسال" بيتبدّل بـ "إيقاف" وقت الرد.
- رسالة الخطأ بتظهر فوق خانة الكتابة.
- التصميم لازم يشتغل كويس على شاشة الموبايل.

## 6. الـ System Prompt

**المعلومات** (كلها وهمية): اسم الجمعية بالعربي والإنجليزي، والعنوان (القاهرة)، والمواعيد (من الأحد للخميس، 9 الصبح لـ 5 العصر)، والتليفون والإيميل.
- **التبرع:** فودافون كاش، وتحويل بنكي، وفي المقر. والإيصال بيتبعت على الإيميل.
- **التطوع:** فورم في المقر أو على الإيميل، وفيه أنشطة زي توزيع وجبات وتعليم وكسوة.
- **طلب المساعدة:** صورة البطاقة، وإثبات دخل، وزيارة ميدانية.

**القواعد:**
1. رد بنفس لغة السائل.
2. ردودك تكون قصيرة، وتستخدم نقاط لما ده يوضّح الكلام.
3. لو المعلومة مش موجودة، متألّفهاش، وجّه السائل للتليفون أو الإيميل.
4. اعتذر بلطف عن أي سؤال ملوش علاقة بالجمعية.
5. متطلبش أي بيانات بنكية أو كلمات سر.

## 7. الاختبارات (Vitest)

- `ai-provider.spec.ts`: قراءة NDJSON، بما فيها سطر متقسم على حتتين، باستخدام `fetch` وهمي.
- `chat-route.spec.ts` (بـ provider وهمي): طلب صحيح بيطلع SSE ومعاه `token` و `done`. طلب غلط بيرجع `400`. لو الـ provider رمى خطأ في الأول بيرجع `503`، ولو رماه في النص بيطلع event من نوع `error`.
- `sse-parser.spec.ts`: events كاملة، وevent متقسم، وكذا event في نفس الحتة.
- `chat.service.spec.ts` (بـ `fetch` وهمي): الـ tokens بتتجمّع صح، و `stop()` مش بيطلّع خطأ، والخطأ بيتسجّل في `error`، والإرسال بيتمنع وقت الـ streaming.
- `chat.spec.ts`: الاقتراحات بتظهر لما الشات فاضي، وزرار الإرسال بيتبدّل بالإيقاف وقت الـ streaming.
- **تجربة يدوية:** `ollama serve` ثم `npm start`، وتسأل أسئلة بالعربي والإنجليزي، وتجرّب الإيقاف، وتطفي Ollama وتشوف رسالة الخطأ.

## 8. التجهيز (مرة واحدة)

```bash
brew install ollama
ollama serve            # أو افتح تطبيق Ollama
ollama pull qwen2.5:3b
```
