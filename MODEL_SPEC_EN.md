# MODEL_SPEC: Cafeteria Menu Classification CNN

> English version of `MODEL_SPEC.md`. If the two differ, `MODEL_SPEC.md` is the working copy.

Service requirements are in `PRD.md` (English: `PRD_EN.md`). Collection amounts, accuracy and latency in this document are plans or targets. Actual data and measurements are recorded once confirmed.

---

## 1. Learning Task

| Item | Content |
|---|---|
| Task | Single-label CNN that classifies the one dish in a user-drawn tray region |
| Input / output | RGB region image → logits for C = 67 classes (plain rice excluded) |
| Service use | Top-3 and model probabilities per region → user confirms dish and portion → nutrient calculation and meal log |
| Link to recommendation | The MVP compares daily/weekly cumulative intake with targets and recommends remaining scheduled dishes by rule according to the current weekly shortfall. The optional LSTM extension forecasts intake for the remaining days from the last 14 days of records and computes the future shortfall against the weekly target. |

## 2. Dataset

### 2.1 Primary: AI Hub "Korean Images (Food)"

| Item | Content |
|---|---|
| Source and access | AI Hub dataset 79, Korean Images (Food), built by NIA. [Dataset page](https://aihub.or.kr/aihubdata/data/view.do?currMenu=115&topMenu=100&aihubDataSe=realm&dataSetSn=79). Downloaded under the research-use agreement on 2026-11-22 (`kfood.zip`, 16.1 GB). Credit NIA; do not redistribute raw archives |
| Scale and format | 27 category ZIPs (grilled dishes, soups, kimchi, stir-fried dishes, stews, …) containing **150 class folders and 150,610 images** (1,000–1,130 per class). Label = class folder name. No official split |
| Scope | Only the original labels matching the 67 target menus. **All 67 classes match a folder name exactly** (67,128 images) |
| Split | No official split, so classes are split train/validation/test 80/10/10 with class stratification. Images from the same original or duplicate group stay in one split |

The 67 rows of `ml/data/menu_classes.csv` link class_id (0–66), class name and the matching AI Hub label. There is no plain-rice row. Class names and the mapping are finalized after review.

### 2.2 Secondary: KENTECH cafeteria region images (team-collected)

**First week.** Team members photograph trays themselves across several dates, meals and corners. They draw a region per dish and check the image against that date's menu schedule. Members cross-review and keep only regions where the dish is clear and identifiable. This initial data is used for operation checks, browser CNN integration, quality review and initial fine-tuning. Images seen during training or development are excluded from the independent test. Shooting date, original tray ID, class, source, review status and split are tracked, and the number of originals is recorded separately from the number of valid regions per class. **The current amount collected is to be confirmed.**

**Expansion during operation.** Consent and status history are recorded in `dataset_contributions`, and reviewed classes and derived files in `contribution_crops`. Ordinary photos are processed in the browser and then released. Only photos from users who separately opt in to contribute training data are collected. The user's final choice is a candidate label; only samples whose label and quality are confirmed against the schedule and by team review enter a versioned dataset. Ambiguous dishes, mixed regions, duplicates and photos exposing identifying information are excluded. EXIF is stripped, and only designated reviewers and trainers access a private space separate from meal records. The mapping between consent records and files is maintained so that originals and derived images can be deleted and excluded from future training on withdrawal, deletion request or retention expiry. Retention periods and backup-deletion timing are decided before operational collection. External posts are excluded until usage rights are confirmed.

| Stage | Recommended target (reviewed KENTECH regions) | Use |
|---|---|---|
| First week | Record the actual count and number of distinct serving days per menu that appears | Check integration and trainable scope without assuming every class is covered |
| First target over several weeks | 30 per class, recommended train/validation/test 18/6/6; 2,010 if all 67 are covered | Initial evaluation on frequent menus; missing classes reported separately |
| Later expansion | 50 per class, recommended 30/10/10; 3,350 if all classes are covered | Prioritize rare and confusable classes and varied lighting, devices and angles |

Several regions cut from one original, or augmented copies, are not counted as independent captures. **All images from the same date form one group**, assigned at roughly 60/20/20. If the same tray or duplicate photos span different dates, they are put in the same group or de-duplicated. Date isolation takes priority over per-class target ratios. For menus whose data is concentrated on one date, additional serving days are collected. Class and sample counts per split and classes that cannot be evaluated are reported, and the test list is frozen.

With consent, only EXIF-stripped images are sent to a private Supabase Storage bucket. Originals and derived crops are grouped under a path per contribution_id, and only reviewers and trainers can access their content. Images that reveal identifying information or have unclear labels are excluded. Only reviewers move items from pending to approved/rejected, and only approved items with a reviewed class label per crop enter the training list. On a withdrawal or deletion request, use is blocked immediately and the original, derived crops and training copies are deleted. Failures are retried, and `deleted` and `deleted_at` are recorded only after deletion is confirmed. Retention periods and backup-deletion timing are fixed before collection begins.

### 2.3 Nutrition (model output → nutrients)

| Item | Contract |
|---|---|
| Source | MFDS national integrated food nutrient information (dishes), standard data. Institutional-catering entries preferred; serving weight, units and source items are reviewed. [Public Data Portal](https://www.data.go.kr/data/15100070/standard.do) |
| Build | `ml/data/fetch_nutrition.py` and `build_menu_seed.py` produce the menu seed `menus_seed.csv` and the matching evidence `menus_seed_sources.csv`. Source: 19,738 rows, 52 fields; all 68 menu rows (67 classes + plain rice) matched |
| Menu count and link | Output column 0–66 = CSV class_id = `model_classes.class_id` (PK). The composite PK and two FKs of `model_class_menu_map(model_class_id, menu_id)` express a many-to-many relation: one class can link to several cooked dishes, and one dish can link to several classes. Plain rice is registered only as a manual menu and excluded from mapping writes. The number of real menus is independent of the 67 outputs. |
| Nutrition and analysis | Sum per-serving nutrients of the final `menus.id` × portion. The MVP uses the 2025 KDRI defaults for men and women aged 19–29 in PRD §3.1, and manages sodium as an excess. Personal BMR is used only in O1 |

### 2.4 Representative Samples

AI Hub samples below were decoded and inspected from the downloaded archive (paths and hashes in `proposal_task1/dataset_evidence.json`, kept outside Git). KENTECH region samples are added after the first week of team photography; consented and reviewed operational samples whose display is permitted are added later.

| Class | AI Hub sample | KENTECH region sample | Observations (lighting, angle, occlusion) |
|---|---|---|---|
| Bulgogi (불고기) | `구이/불고기/Img_007_0000.jpg`, 300×300 | Pending | Single dish on a decorative plate; tight framing |
| Seaweed soup (미역국) | `국/미역국/Img_017_0000.JPG`, 740×1110 | Pending | Another bowl in the background; portrait orientation |
| Napa-cabbage kimchi (배추김치) | `김치/배추김치/Img_033_0000.jpg`, 698×769 | Pending | Overlaid text/watermark; coloured backdrop |

### 2.5 Expected Data Problems

| Problem | Mitigation |
|---|---|
| Background and shooting differences between public photos and real trays | Domain adaptation on cafeteria train data; separate evaluation on the cafeteria test |
| Similar dishes and unclear schedule labels | Hold for review; confusion matrix and top-3 analysis |
| Rare classes | Collect first on different dates; frequency-based correction in train; report per-class support |

---

## 3. Model Architecture

| Item | Content |
|---|---|
| Model | PyTorch torchvision MobileNetV3-Large with ImageNet-pretrained weights `IMAGENET1K_V2` |
| Change | Replace the last classifier layer with `Linear(1280, 67)`. Parameter count and ONNX size are measured after conversion |
| Rationale | Fits the compute limits of mobile browsers and supports transfer learning from pretrained weights |
| Baseline | Evaluate ResNet-18 on the same split and preprocessing and compare accuracy and inference time |

## 4. Training Plan

Train with the PyTorch code in `ml/menu_cnn/` on a Google Colab GPU or a team member's PC. The values below are initial experiment settings; they change according to actual sample counts and validation results, and changes are logged.

| Stage | Data and trainable scope | AdamW learning rate | Schedule / max epochs |
|---|---|---|---|
| 1. Classifier | AI Hub train; backbone parameters and BatchNorm statistics frozen; only the classifier trains | head 1e-3 | Constant, 5 |
| 2. Full fine-tuning | AI Hub train; all layers | backbone 1e-4, head 3e-4 | CosineAnnealingLR, T_max=20, 20 |
| 3. Cafeteria adaptation | Reviewed KENTECH train mixed with part of AI Hub train; initial batch mix 1:1, adjusted to measured counts per domain | all layers 3e-5 | CosineAnnealingLR, T_max=10, 10 |

- Shared settings: `CrossEntropyLoss(label_smoothing=0.1)`, weight decay 1e-4, batch size 64, seed 42 (Python, NumPy, PyTorch, split and sampler). AMP may be used on GPU. Logits go directly into the loss.
- The base transform is shared with §6.1. Only train RGB regions get optional horizontal flip, brightness/colour jitter and up to ±10° rotation, followed by the same resize and normalization.
- Start with ordinary shuffling. If rare classes are weak given per-class train counts and validation recall, compare either an inverse-frequency WeightedRandomSampler or a class-weighted loss. Validation and test distributions are kept as they are.
- At the end of every epoch, evaluate macro-F1 on AI Hub validation for stages 1–2 and on cafeteria validation for stage 3, recording the fixed set of evaluable classes and their support. Save the best checkpoint; on a tie, choose the one with lower validation loss. Stages 2–3 stop after 3 consecutive epochs without a new best score. Each stage starts from the previous stage's best weights.
- Final candidates are compared on the same cafeteria validation set. Configuration, split, weights, class mapping, preprocessing and threshold are bundled into `model_version`. If cafeteria validation data is insufficient, only initial integration results are recorded and model performance is not finalized.

## 5. Evaluation

| Metric | Data | Target / interpretation |
|---|---|---|
| Top-1 / top-3 accuracy | AI Hub test | Top-1 ≥ 85% as a reference target; top-3 also reported |
| Top-1 / top-3 accuracy | Cafeteria test with independent reviewed labels | Targets ≥ 70% / ≥ 90%. Report the number of evaluated classes and samples per class |
| Macro-F1, confusion matrix | Cafeteria test | Per-class performance spread and frequently confused pairs |
| User correction rate | Confirmed and saved CNN regions | Counting rule below |

User Correction Rate is the share of saved CNN regions whose final dish does not belong to the original top-1 class. Because IDs cannot be compared directly under a many-to-many mapping, the set of menus linked to the top-1 class at prediction time is preserved. Choosing a dish inside that set counts as keeping top-1; choosing outside it counts as a correction. Regions saved with top-1 unchanged are included in the denominator. Cancelled or unsaved entries and plain rice or dishes added manually without the CNN are excluded. It measures how often users correct the service and is separate from test top-1 accuracy on independent ground-truth labels.

Initial operation and integration checks use at least 50 real cafeteria regions; those 50 development regions are excluded from the independent test. With 30 images per class (train 18 / validation 6 / test 6), the recommended test set for 67 classes is 402 images; with a later 50 per class (30/10/10), 670. Date groups are separated first, and the report states the number of evaluated classes out of 67, samples per class, and classes that could not be evaluated or have few samples. Performance on small classes is reported as provisional.

**Default selection threshold.** On cafeteria validation data, vary the top-1 softmax score threshold τ and fill in the table below. At or above τ, the top-1 class is shown as the default candidate; saving a real dish still requires user confirmation.

| Metric | Formula |
|---|---|
| High-confidence Prediction Precision | correct with score ≥ τ / count with score ≥ τ |
| Coverage | count with score ≥ τ / all predictions |
| Review Rate | count with score < τ / all predictions |
| Review Error Rate | wrong with score < τ / count with score < τ |

If a denominator is 0, the metric is shown as N/A. The team reviews the balance between high-confidence precision and coverage and fixes τ together with the rationale and sample counts. The test set is used only for final evaluation. Softmax values are shown as model probabilities and may differ from empirical accuracy.

Measure the same six-region batch on at least two phones with a cached model and a ready session. Report measurements per device, browser and repetition.

| Metric | Start | End | Target |
|---|---|---|---|
| CNN inference time | Just before the ONNX Runtime `session.run` call | logits returned | ≤ 3 s |
| Result processing time | Event confirming the last crop region | First frame showing top-3 results for all regions | ≤ 3 s |

Result processing includes crop extraction, preprocessing, batch inference, post-processing and rendering after confirmation. The time from when the photo preview becomes interactive to the last crop confirmation is recorded separately as user interaction time. First model download (request to completion), session initialization (start to ready), first-run results and cached-run results are kept separate. Both times are targets that have not been measured yet.

## 6. Input/Output Interface (web ↔ model contract)

### 6.1 Shared preprocessing (training, validation, browser)

1. On a preview that respects the JPEG/PNG display orientation, the user draws and adjusts a region per dish. Confirmed regions are converted to original-pixel coordinates and cropped. Cafeteria training data is extracted in the same units; AI Hub single-dish images are used as dish-level inputs.
2. Convert to RGB. Training augmentation is applied only at this point.
3. Scale the long side to 224 px and the short side by the same ratio, rounded (minimum 1 px). After bilinear interpolation, centre it on a 224×224 canvas and fill the margin with RGB (124, 116, 104). With an odd margin, the extra pixel goes to the right/bottom. Aspect ratio and the user-confirmed food area are preserved.
4. Convert to float32 and divide by 255. Apply `(x − mean) / std` per RGB channel with ImageNet mean [0.485, 0.456, 0.406] and std [0.229, 0.224, 0.225].
5. Convert HWC to CHW and stack N regions as NCHW. No random transform is used for validation, test or browser inference. Feed the same landscape, portrait and square original files and the same integer-pixel crop coordinates to Python and the browser. Compare shapes, pixel positions and values after each step (RGB conversion, resize, padding, normalization, NCHW), and record the maximum and mean absolute difference of the final float32 tensor. The tolerance for interpolation and rounding differences is fixed after device tests. Then pass one preprocessed result identically to both runtimes, keeping this separate from the logit check in §7.1.

### 6.2 Model input and output

| Direction | Name | dtype | shape | Meaning |
|---|---|---|---|---|
| Input | image | float32 | [N, 3, 224, 224] | N = number of CNN regions confirmed by the user; manually added plain rice is excluded |
| Output | logits | float32 | [N, 67] | The web applies softmax over the class axis and selects top-3 |

### 6.3 Files deployed together

| File | Content |
|---|---|
| `public/models/menu_cnn.onnx` | Trained classifier |
| `public/models/menu_cnn.labels.json` | model_version, the 67 class names in index order, the threshold chosen on validation |

Before deployment, check exhaustively that the same index means the same class in the CSV, the label array and the DB. Deployment is held on any missing, duplicated or reordered entry.

### 6.4 Service action

Show the top-3 classes and model probabilities for each region. At or above τ, the top-1 class is selected by default; below τ, the region is marked "needs confirmation". Among the menus linked to a class, those matching that date's and meal's schedule are shown first. If there are several candidates the user picks the actual dish; if nothing matches, the user searches all menus. A class score is never shown as the probability of an individual cooked dish.

When a meal is saved, `meal_items.menu_id` stores the final actual dish, and `predictions` stores the original top1_class_id, top1_menu_ids, confidence and model_version. Manual additions without the CNN create no prediction row.

## 7. Deployment Plan

### 7.1 Conversion

Convert the model in evaluation mode with a dynamic batch axis and opset 17.

```python
model.eval()
torch.onnx.export(
    model, torch.randn(1, 3, 224, 224), "menu_cnn.onnx",
    input_names=["image"], output_names=["logits"],
    dynamic_axes={"image": {0: "N"}, "logits": {0: "N"}}, opset_version=17,
)
```

On identical validation tensors, confirm a maximum absolute logit error ≤ 1e-4 between PyTorch and ONNX Runtime and 100% top-1 agreement. Report independent test accuracy after the final ONNX is frozen.

### 7.2 Where inference runs

Next.js loads the static model from Vercel and ONNX Runtime Web (wasm) runs inference in the browser. If loading fails, the flow continues with manual selection. A server function for low-end devices is an alternative to be decided after measuring browser performance and reviewing photo-handling policy. In the default path, photos are never sent to the server.

### 7.3 Deployment risks

| Risk | Check / mitigation |
|---|---|
| Slow first download and WASM loading | Measure the deployed file size and first load; show progress and cache per version |
| Latency per device | Measure batch inference and total time separately on real phones. Re-verify accuracy and operator support if quantized |
| Operator or preprocessing mismatch | Check ONNX output comparison and browser input-tensor comparison separately |

## 8. Deliverables and Schedule

| When | Deliverable |
|---|---|
| Task 1 | Dataset download and inspection (done), first week of team photography, review of counts, mapping and representative samples |
| Task 2 | Training code, checkpoints, baseline evaluation, confusion matrix and validation threshold table |
| Task 3 | ONNX, versioned label file, browser crop/inference/save integration, per-device measurements |
| Task 4 | User correction rate measurement; follow-up retraining with consented and reviewed data |

**Open items**: actual counts per class and date for cafeteria data, split and KENTECH representative samples, detailed retention/deletion policy for consented images, threshold and on-device performance.
