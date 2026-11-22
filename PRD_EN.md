# PRD: KENTECH Cafeteria Coach

> English version of `PRD.md`. If the two differ, `PRD.md` is the working copy.

A KENTECH student marks each food region on a photo of a cafeteria tray, and a CNN fine-tuned by our team suggests menu candidates for each region. The student confirms the dishes and portions to log the meal. Based on the intake recorded so far, the service recommends dishes for the next meal from this week's cafeteria menu.

> Assignment requirement: the core AI feature is delivered by one model the team trains itself (a CNN menu classifier), not by an external API. The model is converted to ONNX and runs in the browser; the website is deployed on Vercel.

---

## 1. Project Overview and Target Users

### 1.1 Problem
- Students eat at the cafeteria every day, but recording what and how much they eat is tedious.
- A number such as "500 kcal" does not tell a student what to eat next.
- Naju Innovation City has few dining options, so choosing well at the cafeteria is effectively diet management.

### 1.2 Service
- **Name**: KENTECH Cafeteria Coach (학식 코치)
- **Purpose**: finish logging a meal with one photo, and use the accumulated records to tell the student what to eat next.
- **Role of AI**: predict the menu class from an image of one tray compartment (image classification).
- **Value of AI**: the user does not have to search for and enter each dish. The predicted dish feeds nutrient calculation, weekly analysis and recommendation; without the model the whole flow falls back to manual entry.

### 1.3 Target Users
| User | Situation |
|---|---|
| KENTECH students (primary) | Photograph and log the tray right after receiving it; check recommendations when choosing dinner or the next day's meal |
| First-year and international students | Identify dishes and nutrients from a photo without knowing Korean menu names |
| Cafeteria operator (secondary) | Enter the weekly menu schedule |

### 1.4 Candidate Ideas
| | A. Cafeteria menu recognition and nutrition coach (selected) | B. Cafeteria crowd forecasting |
|---|---|---|
| Model | CNN (image classification) | LSTM (time-series forecasting) |
| Data | AI Hub Korean food images (downloaded and inspected) + cafeteria photos collected and reviewed by the team | No public data; must be collected from scratch |
| Value of AI | Automated entry → nutrient analysis and recommendation | Waiting-time guidance |
| Feasibility | Uses a pretrained model; feasibility is confirmed with the obtained data | Low; not enough data can accumulate within the project period |

**Why A**: the team can train and evaluate on a combination of the public dataset and its own cafeteria photos, and the model output is the input to every later feature (nutrition, analysis, recommendation).

---

## 2. Primary Use Case and User Workflow

**Primary use case**: photograph and log a lunch tray, then get dinner recommendations that fill this week's nutrient shortfall.

At sign-up or first profile setup, the user chooses either the adult-male or adult-female reference; the daily targets in §3.1 are then applied automatically. Age and body-composition inputs are not required.

1. On "Capture tray", take a photo or choose one from the gallery.
2. On the displayed photo, draw one region per dish. Move or resize regions, then confirm.
3. The browser crops the confirmed regions, runs the CNN, and shows the top-3 class names and model probabilities for each region.
4. Among the real menus linked to each class, the dishes on that date's and meal's schedule are shown first. The user confirms the actual dish by choosing a candidate or searching all menus, and selects 0.5, 1 or 1.5 servings. Plain rice is added separately with its portion.
5. The user sees estimated calories, carbohydrate, protein, fat and sodium per region and in total. Signed-in users can save the meal.
6. Home shows daily and weekly progress based on recorded meals, the current shortfall, and recommended dishes from the rest of this week's schedule.

Guests can try everything from photo selection to nutrient display. Weekly analysis and personal recommendations use saved records.

---

## 3. Core Features and Functional Requirements

### 3.1 Essential Features (must work at final submission)
| ID | Feature | Requirement |
|---|---|---|
| F1 | Tray capture/upload | On the photo preview, the user adds, moves, resizes and confirms each crop region |
| F2 | **CNN menu recognition** | Batch inference on the confirmed regions in the browser; show top-3 classes and model probabilities for each |
| F3 | Needs-confirmation handling | Below the threshold chosen on cafeteria validation data, the user must explicitly choose the dish |
| F4 | Correction | Fix via candidates or menu search; record the original top-1 and the final dish separately |
| F5 | Nutrition | Per-serving values from the MFDS food nutrient database (institutional-catering entries preferred) × portion. Nutrition seed for plain rice and actual cafeteria menus: `ml/data/menus_seed.csv`. Marked as "estimate" |
| F6 | Meal saving | Save signed-in users' meal logs to Supabase |
| F7 | Daily/weekly analysis | Cumulative intake, progress and shortfall against targets, weekly nutrient radar, last-14-day calories |
| F8 | Menu recommendation | Score the remaining dishes on this week's schedule with a rule-based "shortfall fill score" and recommend the top 3 |
| F9 | Login | Supabase Auth email magic link |
| F10 | Menu schedule management | An administrator enters the weekly schedule (date, meal, corner, dish) |
| F11 | Default targets and notice | Apply the reference chosen at setup and state that these are general adult reference values. Not a substitute for medical or dietary advice |

#### Default daily targets and recommendation calculation

Considering the university-student age group, the service uses the general adult values for **ages 19–29** from the 2025 Dietary Reference Intakes for Koreans (KDRI). For energy, it applies the **low-active** level used as the default in the reference. Activity level is not surveyed at sign-up, so targets are not presented as a person's actual expenditure or a weight-loss prescription.

| Item | Adult male | Adult female | Basis and use |
|---|---:|---:|---|
| Energy | 2,600 kcal | 2,000 kcal | Estimated Energy Requirement (EER) |
| Carbohydrate | 390 g | 300 g | Within the 50–65% acceptable range, service default 60%: EER × 0.60 ÷ 4 |
| Protein | 65 g | 55 g | Recommended Nutrient Intake (RNI) by age and sex |
| Fat | about 72.2 g | about 55.6 g | Within the 15–30% acceptable range, service default 25%: EER × 0.25 ÷ 9 |
| Sodium | 2,300 mg | 2,300 mg | Chronic Disease Risk Reduction intake (CDRR). A reference line for excess, distinct from an official Tolerable Upper Intake Level (UL) |

The carbohydrate and fat ratios are product defaults chosen within the ranges so that shortfalls are computed consistently. Protein is compared with its own recommended amount, so the energy implied by the three macronutrients is not forced to equal the EER. Calculations use unrounded values; rounding happens only for display. Sources: Ministry of Health and Welfare and the Korean Nutrition Society, *2025 Dietary Reference Intakes for Koreans* (acceptable macronutrient distribution ranges, summary tables by sex and age, and physical-activity levels for EER). [Official release](https://www.kns.or.kr/fileroom/fileroom_view.asp?BoardID=Kdr&idx=168) · [Application guide](https://health.seoulmc.or.kr/uploadFiles/2025_한국인영양소섭취기준_활용.pdf)

The daily target is the chosen table value; the weekly target is daily × 7. The current shortfall for energy, carbohydrate, protein and fat is `max(0, period target − recorded cumulative intake)`. The weekly shortfall is what remains to this week's full target, and unrecorded meals are shown separately. Sodium shows the daily cumulative amount and any excess over the reference, and is excluded from shortfalls and fill scores. A dish's score is the sum over fill nutrients of `min(per-serving amount, weekly shortfall) / weekly target`. Up to three dishes with a positive score are recommended from the rest of this week's schedule.

### 3.2 Optional Features (if time allows, in priority order)
| ID | Feature | Notes |
|---|---|---|
| O1 | Personal targets | Estimate lean body mass (kg) from weight and body-fat percentage, BMR = 370 + 21.6 × lean mass, then apply an activity factor. Only for a personal weight-loss goal, apply a BMR floor and a maximum deficit of 500 kcal/day below maintenance |
| O2 | LSTM future-shortfall forecast | Forecast intake for the remaining days of the week from the last 14 days of daily intake. Recommend using the shortfall after subtracting actual intake plus forecast intake from the weekly target. Keep the MVP recommendation when records are insufficient |
| O3 | Review sentiment analysis | Summarize menu reviews as positive/negative with an LSTM classifier trained on NSMC |
| O4 | Logging badges | 7- and 30-day logging streaks |
| O5 | InBody sheet auto-entry | May use an external vision API (a convenience feature separate from the assignment's trained-model requirement) |

### 3.3 Out of Scope (roadmap)

At submission, the service provides analysis based on accumulated records and rule-based recommendation. Once enough 14-day time-series samples exist, the O2 future-shortfall recommendation will be validated separately. The following are currently out of scope:

crowd forecasting, plate-waste measurement, taste learning, budget recommendations, dietary-restriction filters, meal-buddy matching, sleep/exercise integration, weekly reports

---

## 4. AI Model: Role, Input, Output and Expected Behavior

The detailed training plan is in `MODEL_SPEC.md` (English: `MODEL_SPEC_EN.md`).

| Item | Content |
|---|---|
| Task | Image classification (one tray region → menu class) |
| Model | Fine-tuned ImageNet-pretrained MobileNetV3-Large (a lightweight model chosen for mobile-browser inference) |
| Data | AI Hub Korean food images and reviewed KENTECH region images; trained on 67 classes, excluding plain rice |
| User input | One tray photo (JPEG/PNG) |
| Preprocessing | User crop → RGB → aspect-preserving resize and padding to 224×224 → float32, ImageNet normalization → NCHW. Identical for validation and inference; augmentation only in training |
| Model input | `float32` tensor `[N, 3, 224, 224]` (N = number of CNN regions the user confirmed) |
| Model output | `float32` logits `[N, 67]` (C = 67). After softmax, top-3 classes and probabilities per region |
| Service action | At or above the threshold, preselect the top-1 class; below it, require confirmation. Nutrients are computed from the final menu ID |
| Metrics | (1) Top-1/top-3 accuracy on the AI Hub test split (2) top-1/top-3 accuracy on the **real cafeteria region test set** (3) inference time in phone browsers |
| Where it runs | In the browser (PyTorch → ONNX → ONNX Runtime Web). No server or GPU required |

**Until the model is ready (Task 1)**: the recognition result area is labelled "AI model not yet connected — example screen" and only manual selection works. Hard-coded results are never shown as real predictions.

---

## 5. Page Layout and UI Requirements

Mobile first (width ≥ 360 px), bottom tab navigation.

| Page | Path | Content | Login |
|---|---|---|---|
| Main | `/` | One-line service description, "Capture tray" button, (when signed in) today's progress and recommendation card | Not required |
| Recognition | `/log/new` | Capture/select → draw and adjust crops on the photo → top-3 and model probabilities per region → confirm dish and portion → nutrition and save | Only for saving |
| Analysis | `/dashboard` | Weekly radar, 14-day calories, recommendations | Required |
| My info | `/profile` | MVP default reference choice; body composition only when personal targets are used (O1) | Required |
| Login | `/login` | Email magic link | — |
| Menu admin | `/admin/menu` | Enter schedules and menus | Administrator |

UI requirements
- Candidates are labelled "model probability" and nutrient values "estimate". Scores may differ from actual accuracy.
- Regions that need confirmation are colour-coded, and a candidate can be switched with one tap.
- Show progress while the model loads; if loading fails, fall back to manual selection.
- Buttons and select boxes carry accessible names for screen readers.

---

## 6. Technology Stack and System Architecture

| Area | Choice |
|---|---|
| Web | Next.js (App Router), TypeScript, Tailwind CSS |
| Deployment | Vercel |
| DB and auth | Supabase (Postgres, Auth, RLS) |
| Model training | PyTorch, torchvision (Colab or a team member's PC) |
| Model inference | ONNX Runtime Web (browser, wasm) |
| Charts | Recharts |

```
 User (phone browser)
   │ ① tray photo
   ▼
 Next.js pages (static/server rendering on Vercel)
   │ ② preview → user confirms crops → preprocessing
   ▼
 ONNX Runtime Web ── /models/menu_cnn.onnx (Vercel static file)
   │ ③ top-3 classes and probabilities per region → map to schedule menus
   ▼
 Result screen (correction) ── ④ save ──▶ Supabase (meal_logs, meal_items, predictions)
   ▲                                          │
   └──── ⑤ weekly analysis / recommendation ◀─┘  (reads menus, weekly_menu)
```

In the default recognition path, the photo and crops are processed only in browser memory and released after recognition and confirmation. The server receives only meals and prediction history saved by signed-in users. Images for review are sent to the private storage in §7 only when the user separately opts in to contribute training data.

---

## 7. Data Storage Requirements (Supabase)

| Table | Main fields | Purpose |
|---|---|---|
| profiles | id, role, reference_profile, target_version | adult_male/adult_female chosen at setup, referencing KDRI 2025 defaults. Body composition and activity for O1 are optional fields |
| model_classes | class_id PK (0–66), class_name | 67 rows, identical to the CSV and ONNX output indices |
| menus | id PK, name, manual_only, kcal, carb, protein, fat, sodium | Per-serving nutrients for each real menu. Plain rice is manual_only |
| model_class_menu_map | model_class_id FK, menu_id FK | Composite PK. Mapping to manual_only menus is blocked |
| weekly_menu | date, meal, corner, menu_id FK | Dishes actually served and recommendation candidates |
| meal_logs | id, user_id, eaten_at, meal | Meal records |
| meal_items | id, meal_log_id, menu_id FK, portion | Final actual dish and portion |
| predictions | meal_item_id PK/FK, top1_class_id FK, top1_menu_ids, confidence, model_version | Original top-1 class, the set of menu IDs linked to it at prediction time, and its score. Saved in the same transaction as the items when a meal is confirmed |
| dataset_contributions | contribution_id PK, user_id, storage_path, consent_at, consent_version, status, reviewed_at, reviewed_by, withdrawn_at, deletion_requested_at, deleted_at | Consent, review and deletion history per original photo |
| contribution_crops | contribution_id FK, crop_id, storage_path, candidate_menu_id, verified_class_id FK | Derived crop paths per original, candidate menu and reviewed class. Composite PK; label is NULL before review |

Output column 0–66 = CSV class_id = `model_classes.class_id` (PK). The composite PK and two FKs of `model_class_menu_map(model_class_id, menu_id)` express a many-to-many relation: one class can link to several cooked dishes, and one dish can link to several classes. Plain rice is registered only as a manual menu and excluded from mapping writes. The number of real menus is independent of the 67 outputs.

User Correction Rate is the share of saved CNN regions whose final dish does not belong to the original top-1 class. Because IDs cannot be compared directly under a many-to-many mapping, the set of menus linked to the top-1 class at prediction time is preserved. Choosing a dish inside that set counts as keeping top-1; choosing outside it counts as a correction. Regions saved with top-1 unchanged are included in the denominator. Cancelled or unsaved entries and plain rice or dishes added manually without the CNN are excluded. It measures how often users correct the service and is separate from test top-1 accuracy on independent ground-truth labels.

During the first week, team members photograph and review trays themselves. After that, ordinary uploads are released after inference. Opting in to contribute training data is independent of saving a meal, and images without consent are never used for training. With consent, only EXIF-stripped images are sent to a private Supabase Storage bucket. Originals and derived crops are grouped under a path per contribution_id, and only reviewers and trainers can access their content. Images that reveal identifying information or have unclear labels are excluded. Only reviewers move items from pending to approved/rejected, and only approved items with a reviewed class label per crop enter the training list. On a withdrawal or deletion request, use is blocked immediately and the original, derived crops and training copies are deleted. Failures are retried, and `deleted` and `deleted_at` are recorded only after deletion is confirmed. Retention periods and backup-deletion timing are fixed before collection begins.

Personal records are limited to their owner by RLS; writes to menus, schedules and mappings require administrator rights. Contributors can only view their own consent and status and withdraw; changing review status or labels and accessing others' files are blocked.

- API keys and service-role keys are never committed; they live only in Vercel environment variables.

---

## 8. Deployment Approach and Technical Risks

**Deployment**: the GitHub `main` branch is connected to Vercel for automatic deployment. Model files are placed in `public/models/` and deployed as static files.

| Risk | Impact | Mitigation |
|---|---|---|
| Model size | Slow first download | Measure the actual ONNX size and first load time; show progress and cache. If needed, verify int8 accuracy and operator support |
| Phone-browser inference time | Latency depends on region count and device | Run confirmed regions as one batch; verify each of the two speed targets in §9 |
| Gap between training data and cafeteria photos (domain shift) | Lower accuracy on real photos | Collect across dates and menus; additional training on reviewed cafeteria train data |
| Cafeteria dishes missing from AI Hub classes | Too few samples in that domain | Review the 67-class mapping and add cafeteria photos for those dishes. Manual dish selection is supported |
| Tray region position differs per photo | Wrong region input | The user draws and adjusts each region on the preview |
| Unsupported ONNX operators | Conversion failure | Use a standard torchvision model and opset 17; compare outputs with ONNX Runtime right after conversion |
| AI Hub data terms | Plan change if unusable | Downloaded under the research-use agreement and verified on 2026-11-22. Fallback if access is withdrawn: a Kaggle Korean food image dataset + cafeteria photos |

---

## 9. Acceptance Criteria (final service)

**Task 1 (initial website)**
- [ ] The Vercel URL opens without login, and the main page explains the service purpose.
- [ ] After choosing a photo on `/log/new`, the user can draw, move and resize regions on the preview.
- [ ] The result area carries an "AI model not yet connected" label and shows no fake predictions.
- [ ] `PRD.md` and `MODEL_SPEC.md` are in GitHub, and no secrets are committed.

**Final submission**
- [ ] Initial operation and integration checks use at least 50 real cafeteria regions. Those 50 development regions are excluded from the independent test. With 30 images per class (train 18 / validation 6 / test 6), the recommended test set for 67 classes is 402 images; with a later 50 per class (30/10/10), 670. Date groups are separated first, and the report states the number of evaluated classes out of 67, samples per class, and classes that could not be evaluated or have few samples. Performance on small classes is reported as provisional.
- [ ] Evaluate against targets of top-1 ≥ 70% and top-3 ≥ 90% on the independent cafeteria test, stating the evaluation scope.
- [ ] Report both AI Hub test-split accuracy and real cafeteria photo accuracy.
- [ ] Daily and weekly targets are computed for both default profiles without body-composition input, and no dish is recommended because of a sodium shortfall.
- [ ] When two real dishes linked to one class are saved separately, each uses the nutrient values of the chosen dish.
- [ ] Each of the two time targets below is verified.
- [ ] After drawing and adjusting two food regions at arbitrary positions, top-3 is shown for each. Adding plain rice manually is reflected in the nutrient total and the saved record.
- [ ] Saving without opting in to contribute training data causes no image transfer or storage.
- [ ] A first-time user can capture → correct → save within one minute without guidance.
- [ ] A saved meal appears immediately in home progress and the weekly chart.
- [ ] The recommendation card recommends only dishes on the schedule, and recommends nothing when there is no shortfall.
- [ ] When signed in with another account, other users' records are not visible.
- [ ] If the model fails to load, the meal can still be logged with manual selection.

---

Measure the same six-region batch on at least two phones with a cached model and a ready session. Report measurements per device, browser and repetition.

| Metric | Start | End | Target |
|---|---|---|---|
| CNN inference time | Just before the ONNX Runtime `session.run` call | logits returned | ≤ 3 s |
| Result processing time | Event confirming the last crop region | First frame showing top-3 results for all regions | ≤ 3 s |

Result processing includes crop extraction, preprocessing, batch inference, post-processing and rendering after confirmation. The time from when the photo preview becomes interactive to the last crop confirmation is recorded separately as user interaction time. First model download (request to completion), session initialization (start to ready), first-run results and cached-run results are kept separate. Both times are targets that have not been measured yet.

## Appendix: Open Items
- Measured sample counts per class and date; mapping between the schedule and nutrient data; review of the class–real dish mapping
- Threshold considering high-confidence prediction precision and coverage on cafeteria validation data; accuracy and on-device latency; whether the 3-second target after the last crop confirmation is met
- Retention period and backup-deletion procedure for consented images; start date for collecting operational data
- Source of the weekly menu schedule (the cafeteria operator's Instagram, the university website)
