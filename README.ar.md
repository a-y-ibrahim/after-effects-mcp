# أداة After Effects MCP - النسخة المحسنة متعددة اللغات

[![CI](https://github.com/a-y-ibrahim/after-effects-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/a-y-ibrahim/after-effects-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-6366f1)](https://modelcontextprotocol.io)
[![English](https://img.shields.io/badge/English-Click-blue)](README.md)

تحكم في Adobe After Effects من أي عميل MCP (مثل Claude Code / Claude Desktop) باللغة الطبيعية:
أنشئ وافحص الكومبوزيشن والطبقات، حرك، طبق التأثيرات والبريست، أدر الماسكات والكاميرات،
**صدر في الخلفية**، ونفذ أي ExtendScript - مع **دعم عربي / RTL من الدرجة الأولى**، وأدوات تعمل على
After Effects بـ**أي لغة واجهة**.

هذه نسخة محسنة مبنية على العمل الأصلي لـ
[**Dakkshin/after-effects-mcp**](https://github.com/Dakkshin/after-effects-mcp). انظر [CREDITS.md](CREDITS.md).

---

## ✨ لماذا هذه النسخة

| الجانب                 | هذه النسخة                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **تعمل بأي لغة في AE** | كل عمليات البحث عن الخصائص تستخدم matchNames ثابتة لا تتغير باللغة → لا تتعطل على AE العربي/الفرنسي/الألماني/الياباني        |
| **النص العربي / RTL**  | `create-text-layer` يكتشف العربية تلقائيا ويضبط الاتجاه من اليمين لليسار والمحاذاة لليمين                                     |
| **تنفيذ سكربت حر**     | `execute-script` يشغل أي ExtendScript → الوصول لكل ميزات AE                                                                   |
| **فحص عميق**           | `inspect-comp` / `inspect-layer` - ترى الحالة الدقيقة قبل التعديل                                                              |
| **التصدير**            | قائمة إخراج داخل الواجهة **و** `aerender` في الخلفية (بلا تجميد)                                                               |
| **الموثوقية**          | معرف لكل أمر (لا نتائج قديمة)، مجموعة تراجع واحدة لكل أمر، استطلاع أسرع، مجلد مشترك محصن ضد OneDrive، فحص صحة `check-bridge` |
| **إدارة الطبقات**      | كاميرات، تكرار، حذف، ماسكات، تعديل دفعي، إعدادات الكومب - كأدوات مخصصة                                                        |

**المجموع 47 أداة.** التفاصيل في [ENHANCEMENTS.md](ENHANCEMENTS.md).

---

## 📋 المتطلبات

- **Adobe After Effects** 2022 أو أحدث
- **ويندوز أو ماك.** After Effects نفسه لا يعمل إلا على هذين النظامين، لذا يشغل
  الخادم على نفس الجهاز الذي عليه After Effects. عملية Node تقلع على لينكس وينجح
  البناء والاختبار هناك، لكن لا يوجد After Effects ليتحكم به.
- **Node.js 18+** - <https://nodejs.org>
- عميل MCP (مثل **Claude Code**: `npm install -g @anthropic-ai/claude-code`)

## 🚀 التثبيت

```bash
git clone https://github.com/a-y-ibrahim/after-effects-mcp.git
cd after-effects-mcp
npm install              # يثبت ويبني
npm run install-bridge   # ينسخ اللوحة إلى مجلد ScriptUI Panels في AE
```

ثم داخل After Effects:

1. فعل السكربت - **ويندوز**: Edit > Preferences > Scripting & Expressions؛ **ماك**: After Effects > Settings > Scripting & Expressions ← فعل **«Allow Scripts to Write Files and Access Network»**.
2. أعد تشغيل After Effects.
3. **Window > mcp-bridge-auto.jsx** - أبق هذه اللوحة مفتوحة.

سجل الخادم في عميل MCP لديك:

```bash
claude mcp add AfterEffectsMCP node /المسار/المطلق/إلى/after-effects-mcp/build/index.js
```

**أول اختبار:** اطلب من العميل _«check the After Effects bridge»_. يجب أن يرد بـ
`bridgeVersion: 1.7.2-mcp-enhanced` و`versionMatch: true`.

> 💡 إن عدلت الخادم، أعد `npm run build` ثم أعد تشغيل عميل MCP.
> إن عدلت الجسر، أعد أيضا `npm run install-bridge` وأعد تشغيل After Effects.

---

## 🧰 الأدوات بإيجاز

**الفحص والتشخيص** - `see-frame`، `contact-sheet`، `match-reference`، `inspect-comp`، `inspect-layer`، `get-results`، `check-bridge`، `run-bridge-test`، `get-help`
**الكومبوزيشن والطبقات** - `create-composition`، `set-composition-properties`، `create-text-layer`، `create-camera`، `create-adjustment-layer`، `duplicate-layer`، `delete-layer`، `center-layers`، `set-layer-mask`، `batch-set-layer-properties`
**التحريك** - `setLayerKeyframe`، `setLayerExpression`، `get-layer-clip-frames`
**التأثيرات** - `apply-effect`، `add-any-effect`، `apply-effect-template`، `list-layer-effects`، `list-available-effects`، `set-effect-property`، `set-effect-keyframe`، `remove-effect`، `mcp_aftereffects_get_effects_help`
**البريست** - `list-presets`، `search-presets`، `apply-preset`
**الصوت والعلامات** - `get-audio-info`، `set-audio-levels`، `analyze-audio-waveform`، `add-marker`، `add-markers-bulk`
**التصدير** - `add-to-render-queue`، `render-queue`، `start-render`، `render-aerender`، `render-status`
**القوة** - `execute-script` (سكربت حر)، `run-script`، `test-animation`

لنظرة عامة على المشروع/الكومب استخدم أيضا `run-script` مع `getProjectInfo` / `listCompositions`.

---

## 🌙 مثال عربي / RTL

> «أنشئ طبقة نص تقول ‹مرحبا بالعالم›»

يكتشف `create-text-layer` النص العربي ويضبط تلقائيا الاتجاه من اليمين لليسار والمحاذاة لليمين.
استخدم خطا يدعم العربية (مثل `Tahoma` أو `Cairo`). وللتشكيل العربي الكامل، فعل محرك نص
الشرق الأوسط في After Effects (**ويندوز**: Preferences > Type؛ **ماك**: Settings > Type).

---

## 🩺 حل المشكلات

- **أي تجمد / سلوك غريب** ← اطلب أولا _«check the After Effects bridge»_.
- **تحذير عدم تطابق النسخة** ← أعد `npm run install-bridge` وأعد تشغيل After Effects.
- **«Result file appears stale»** ← اللوحة غير مفتوحة أو لا تستطيع الكتابة؛ أعد فتحها وتأكد من صلاحية السكربت.
- **ويندوز + OneDrive** ← المجلد المشترك هو `%LOCALAPPDATA%\ae-mcp-bridge` (محصن ضد OneDrive). يمكن تجاوزه على الطرفين بمتغير البيئة `AE_MCP_BRIDGE_DIR`.

---

## 📄 الحقوق والترخيص

مرخص بموجب **رخصة MIT**. العمل الأصلي © 2025 Dakkshin؛ النسخة المحسنة متعددة اللغات
© 2026 Abdelrahman Youssef. انظر [LICENSE](LICENSE) و[CREDITS.md](CREDITS.md).
