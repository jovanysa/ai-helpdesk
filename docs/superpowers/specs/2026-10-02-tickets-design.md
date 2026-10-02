# المرحلة 2: التذاكر وصفحة الموظفين — Design Spec

- **التاريخ:** 2026-10-02
- **الحالة:** المطوّر فوّض كل القرارات ("اعملها كلها وفي الآخر نراجعها مع بعض")، فالقرارات دي اتاخدت من غير أسئلة، وهتتراجع بعد التنفيذ.
- **مبني على:** المرحلة 1 (`docs/superpowers/specs/2026-10-02-ai-chat-design.md`)

## 1. الهدف

- **ليه:** نتعلم **الداتابيز** (SQL و SQLite)، و**الـ login** (تشفير الباسورد والـ sessions والـ cookies)، و**إن الـ AI يرجّع بيانات منظمة** (JSON) بدل ما يرجّع كلام.
- **إيه:** العميل يقدر يفتح تذكرة من الشات أو من فورم، والـ AI يصنّفها، والموظفين يسجّلوا دخول ويشوفوا التذاكر ويغيّروا حالتها.
- **النجاح معناه:**
  1. في الشات، بعد أول رد من الـ AI، يظهر زرار "حوّل لموظف". العميل يكتب اسمه وتليفونه، والتذكرة تتسجّل ومعاها المحادثة كلها، ويظهرله رقم التذكرة.
  2. صفحة `/support/new` فيها فورم بيعمل تذكرة من غير شات.
  3. خلال ثواني من فتح التذكرة، بيتحدد نوعها وأولويتها تلقائيًا بالـ AI. ولو Ollama مقفول، التذكرة بتتسجّل عادي، وحالة التصنيف بتبقى "فشل"، وفيه زرار "إعادة التصنيف".
  4. `/staff` محدش يقدر يدخلها من غير login. والموظف يشوف التذاكر من الأحدث للأقدم، ويفلترها بالحالة والنوع والأولوية، ويفتح التذكرة ويغيّر حالتها أو نوعها أو أولويتها.
  5. الباسورد بيتخزّن مشفّر، والـ session في cookie `httpOnly`، وتسجيل الخروج بيلغي الـ session من الداتابيز.
  6. `npm test` بينجح من غير Ollama.

## 2. برّه النطاق

- إن الموظف يرد على العميل من السيستم (الموظف هيكلّم العميل بالتليفون).
- ملخص من الـ AI: جرّبناه والموديل الصغير كان بيكتب بلغات عشوائية.
- أدوار وصلاحيات مختلفة للموظفين (كلهم ليهم نفس الصلاحيات).
- صفحة لتسجيل موظفين جداد (الحساب بيتعمل من environment variables).
- Rate limiting و captcha على الفورم العام. ده مشروع تعليمي على localhost، ودي هتبقى ملاحظة لبعدين.
- إشعارات بالإيميل، و real-time updates (الموظف بيعمل refresh أو بيدوس "تحديث").

## 3. قرارات تقنية

| القرار | الاختيار | ليه |
|---|---|---|
| الداتابيز | **SQLite عن طريق `node:sqlite`** (موجود في Node 24) | داتابيز حقيقية بـ SQL، ومن غير تسطيب ولا مكتبات ولا سيرفر داتابيز. جرّبناها في Node وفي `ng test` واشتغلت. |
| مكان الملف | `data/helpdesk.db`، ويتغيّر بـ `DB_PATH`. الفولدر `data/` في `.gitignore`. | |
| تشفير الباسورد | `scrypt` من `node:crypto`، مع salt عشوائي لكل باسورد | مبني جوه Node، وآمن. |
| الـ session | token عشوائي (32 byte) في cookie اسمه `sid` عليه `HttpOnly; SameSite=Strict; Path=/`، ومدته 7 أيام. الداتابيز بتخزّن **hash** للـ token، مش الـ token نفسه. | الـ JavaScript في المتصفح مش هيقدر يقرأ الـ cookie، ولو الداتابيز اتسرقت، الـ tokens اللي فيها مش هتنفع. `SameSite=Strict` مع إن الطلبات بتبقى JSON بيحموا من CSRF. |
| ليه مش JWT؟ | sessions في الداتابيز | أسهل في الفهم، وتسجيل الخروج بيلغي الـ session فعلًا. |
| حساب الموظف | لما السيرفر يبدأ، لو `STAFF_EMAIL` و `STAFF_PASSWORD` موجودين (ومعاهم `STAFF_NAME` اختياري)، الحساب بيتعمل لو مش موجود. | من غير سكريبت منفصل ولا صفحة تسجيل. |
| تصنيف الـ AI | Ollama `/api/chat` ومعاه `format` (JSON schema) و `temperature: 0` و `stream: false` | Ollama بيجبر الموديل يرجّع JSON بالشكل المطلوب. |
| التصنيف بيحصل امتى | **بعد** ما التذكرة تتسجّل (fire-and-forget) | العميل مش بيستنى الموديل. |
| Angular HTTP | `HttpClient` مع `provideHttpClient(withFetch())` | الطريقة الأساسية في Angular. الشات هيفضل على `fetch` علشان الـ streaming. |
| الفورمز | Reactive Forms | Stable ومستخدمة في معظم المشاريع. |
| حماية الصفحات | `authGuard` (functional `CanActivateFn`) | |
| SSR | صفحات `/staff/**` بتشتغل في المتصفح بس (`RenderMode.Client`) | الصفحات دي محتاجة الـ cookie بتاع المستخدم، فمينفعش تتعمل prerender. |
| اختبار السيرفر | نفس طريقة المرحلة 1: **handlers عبارة عن functions عادية** بتاخد dependencies وتطلّع `{ status, body, setCookie? }`، والـ router مجرد ربط بـ Express | الاختبارات مش هتستورد Express. |

## 4. الداتابيز

```sql
CREATE TABLE IF NOT EXISTS staff_users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,          -- "scrypt$<salt hex>$<hash hex>"
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,          -- sha256(token) hex
  user_id INTEGER NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('chat','form')),
  transcript TEXT,                      -- JSON array of {role, content}; NULL for form tickets
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','resolved')),
  category TEXT CHECK (category IN ('donation','volunteering','help_request','complaint','other')),
  priority TEXT CHECK (priority IN ('low','medium','high')),
  classification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (classification_status IN ('pending','done','failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

- التواريخ بنخزّنها ISO strings (`new Date().toISOString()`).
- `PRAGMA foreign_keys = ON` و `PRAGMA journal_mode = WAL`.
- كل الـ queries بتستخدم `?` parameters (prepared statements)، ومفيش أي string concatenation، وده بيحمي من SQL injection.

## 5. الـ API

كل الردود JSON. والأخطاء شكلها `{ error: string }`.

| Method و Path | مين يستخدمه | Body | الرد |
|---|---|---|---|
| `POST /api/tickets` | أي حد | `{ name, phone, description, transcript? }` | `201 { id }`، أو `400` |
| `GET /api/tickets?status=&category=&priority=` | موظف | | `200 TicketSummary[]` (من غير transcript)، من الأحدث للأقدم |
| `GET /api/tickets/:id` | موظف | | `200 Ticket`، أو `404` |
| `PATCH /api/tickets/:id` | موظف | `{ status?, category?, priority? }` | `200 Ticket`، أو `400` أو `404` |
| `POST /api/tickets/:id/classify` | موظف | | `202 Ticket` (والتصنيف بيرجع `pending` تاني) |
| `POST /api/auth/login` | أي حد | `{ email, password }` | `200 StaffUser` ومعاه `Set-Cookie`، أو `401 { error: 'invalid credentials' }` |
| `POST /api/auth/logout` | أي حد | | `204` والـ cookie بتتمسح |
| `GET /api/auth/me` | موظف | | `200 StaffUser`، أو `401` |

- أي endpoint للموظفين من غير session صالحة بيرجّع `401`.
- لو الطلب فيه JSON بايظ أو حجمه كبير، بيرجّع `{ error }` JSON بدل صفحة HTML. ده بيصلّح ملاحظة من مراجعة المرحلة 1.

**التحقق من التذكرة:**
- `name`: من 2 لـ 100 حرف بعد `trim`.
- `phone`: الأرقام العربية (٠-٩) والفارسية (۰-۹) بتتحوّل لأرقام إنجليزي، والمسافات بتتشال، وبعدين الرقم لازم يطابق `^\+?[0-9]{8,15}$`، وبيتخزّن بعد التحويل ده.
- `description`: من 5 لـ 2000 حرف بعد `trim`.
- `transcript` (اختياري): array فيها من 1 لـ 20 رسالة، كل رسالة فيها `role` قيمته `user` أو `assistant`، و `content` نوعه string وطوله ≤ 8000.

**التحقق من الـ PATCH:** لازم يبقى فيه حقل واحد على الأقل، وكل قيمة لازم تكون من القيم المسموحة. الموظف ممكن يغيّر النوع أو الأولوية، وساعتها `classification_status` بتبقى `done`.

## 6. التصنيف

- `classifyTicket(description, transcript?) → { category, priority }`، وبيستخدم `fetch` لـ Ollama.
- الـ prompt بيعرّف الأنواع وقواعد الأولوية، وفيه أمثلة قصيرة، منها مثال شكوى، لأن الموديل صنّف الشكوى غلط في التجربة.
  - **عالية (high):** حد محتاج مساعدة عاجلة (صحة، أو أكل، أو أمان)، أو متضايق جدًا.
  - **متوسطة (medium):** شكاوى وطلبات مساعدة.
  - **منخفضة (low):** أسئلة عامة.
- لو الرد مش JSON صالح أو فيه قيم مش مسموحة، بيرمي خطأ والتصنيف بيبقى `failed`.
- `TicketClassifier.classifyInBackground(id)`: بيحط `pending`، وبعدين يصنّف ويحدّث التذكرة، ولو فشل بيحط `failed` ويكتب السبب في الـ log. ومفيش أي exception بيطلع منه برّه.

## 7. الشاشات

| الـ Route | الوصف |
|---|---|
| `/` | الشات. يتضاف زرار "حوّل لموظف" بيظهر لما يبقى فيه رد واحد على الأقل من الـ assistant ومفيش رد شغال دلوقتي، ويتضاف لينك "قدّم طلب" في الـ header. |
| `/support/new` | فورم: الاسم، والتليفون، ووصف الطلب. بعد الإرسال تظهر رسالة: "تم تسجيل طلبك رقم #N، هيتواصل معاك موظف قريب." |
| `/staff/login` | تسجيل الدخول. لو نجح، يروح لـ `/staff`. |
| `/staff` (محمي) | جدول التذاكر بالرقم والاسم والنوع والأولوية والحالة والتاريخ، وفوقه فلاتر، وزرار "تحديث"، وزرار "خروج". |
| `/staff/tickets/:id` (محمي) | بيانات العميل، والوصف، والمحادثة لو موجودة، و3 قوايم اختيار (الحالة والنوع والأولوية) بتتحفظ أول ما تتغيّر، وحالة التصنيف، وزرار "إعادة التصنيف" لو التصنيف فشل أو لسه شغال. |

- **فورم "حوّل لموظف" في الشات:** بيظهر تحت الرسايل وفيه الاسم والتليفون وملاحظة اختيارية. الوصف بيبقى الملاحظة لو موجودة، ولو مش موجودة بيبقى آخر رسالة كتبها العميل. والـ transcript هو آخر 20 رسالة.
- كل النصوص اللي بتظهر بالعربي، وفيه labels ثابتة لكل نوع وأولوية وحالة:
  - **النوع:** تبرع، تطوع، طلب مساعدة، شكوى، أخرى.
  - **الأولوية:** منخفضة، متوسطة، عالية.
  - **الحالة:** جديدة، قيد المتابعة، تم الحل.

## 8. الأخطاء

| المشكلة | اللي هيحصل |
|---|---|
| Ollama مقفول وقت التصنيف | التذكرة بتتسجّل، والتصنيف بيبقى `failed`، والموظف بيشوف "التصنيف فشل" وزرار إعادة المحاولة. |
| الموديل رجّع JSON غلط | نفس اللي فوق. |
| session انتهت أثناء الشغل | أي `401` في صفحات الموظفين بيوديه لـ `/staff/login`. |
| باسورد غلط | "البريد أو كلمة المرور غير صحيحة"، ومن غير ما نوضّح أنهي فيهم الغلط. |
| فورم فيه أخطاء | رسايل تحت الحقول، وزرار الإرسال بيتقفل لحد ما الفورم يبقى صح. |
| السيرفر وقع وقت الإرسال | رسالة "حصل خطأ، حاول تاني" والبيانات اللي اتكتبت بتفضل زي ما هي. |

## 9. الاختبارات

- **السيرفر**، بداتابيز `:memory:` حقيقية مش وهمية:
  - الـ schema.
  - الـ repositories (التذاكر والموظفين والـ sessions).
  - تشفير الباسورد والتحقق منه.
  - الـ sessions وانتهاء صلاحيتها.
  - التحقق من التذاكر.
  - الـ handlers (الحالات والأكواد، والـ 401 من غير session).
  - المصنّف بـ `fetch` وهمي (JSON صالح، وقيم مش مسموحة، وخطأ في الشبكة).
  - `classifyInBackground` (من `pending` لـ `done`، أو لـ `failed`).
- **Angular**:
  - `TicketsApi` و `AuthService` بـ `HttpTestingController`.
  - `authGuard`.
  - الفورمز (التحقق والإرسال).
  - صفحة الموظفين (الفلاتر والتعديل).
  - زرار "حوّل لموظف" في الشات.
- **تجربة حقيقية:** نعمل build، وبعدين نجرّب السيناريو كله بـ `curl` مع Ollama: نعمل تذكرة، وتتصنّف، ونعمل login، ونشوف القايمة، ونعمل PATCH، ونعمل logout.

## 10. التشغيل

```bash
STAFF_EMAIL=admin@alkhair.example STAFF_PASSWORD='...' STAFF_NAME='مدير' npm start
```
