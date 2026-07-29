# NCCN 解析基準量測

記錄本機 NCCN PDF 全庫跑過解析器後的機械面指標，作為**基準線**：換新版指引或改動解析器後重跑一次，就能看出哪一份退步了。

這份報告只回答「解析器有沒有正常運作」，**不回答「抽出來的療程臨床上對不對」**——後者需要人工核對，方法見文末。

- 量測日期：2026-07-29
- 解析器：`nccn-parser.js` schemaVersion 7（commit 664452e）
- 來源：`OneDrive/Neo-BOT/癌症醫院/NCCN 指引/App 專用`，66 份，119 MB

## 總覽

| 項目 | 結果 |
|---|---|
| 解析成功 | **66 / 66**（失敗 0） |
| 狀態 | 65 `parsed` + 1 `redirect_notice` |
| 版本偵測 | 66 / 66 全部成功 |
| 低文字量頁面 | 0（無掃描檔／圖片式 PDF） |
| 總頁數 | 7,727（含 redirect 通知 1 頁；下方表格合計 7,726 為 65 份 parsed） |
| 治療頁 | 1,660 |
| 治療候選 | 12,073 |
| 已綁定臨床情境 | 5,055 / 12,073（42%） |
| 標記為需人工核對 | 3,733 / 12,073（31%） |
| 總耗時 | 102 秒（平均每份 1.5 秒） |

頁面角色分佈：pathway 829、principles 637、recommendation 102、workup 64、supporting 28。

`Hepatobiliary Cancers.pdf` 只有 1 頁且狀態為 `redirect_notice`，因為該指引已拆分為 Hepatocellular Carcinoma 與 Biliary Tract Cancers——解析器正確辨識並提示，屬預期行為。

## 需優先人工核對

### 治療頁比例偏低（可能漏抓演算法頁）

| 指引 | 頁數 | 治療頁 | 比例 |
|---|---:|---:|---:|
| Chronic Lymphocytic Leukemia / SLL | 118 | 11 | 9% |
| Myeloproliferative Neoplasms | 125 | 10 | 8% |
| Mesothelioma: Pleural | 58 | 5 | 9% |
| Mesothelioma: Peritoneal | 42 | 3 | 7% |
| MLN with Eosinophilia and TK Fusions | 51 | 5 | 10% |

血液腫瘤與間皮瘤的指引本身有較大比例是討論文字，因此未必是缺陷，但這五份建議實際打開對照，確認該有的治療演算法頁都被抓到。

### 每治療頁選項偏少

| 指引 | 治療頁 | 選項 | 每頁 |
|---|---:|---:|---:|
| dfsp | 6 | 10 | 1.7 |
| Systemic Mastocytosis | 12 | 29 | 2.4 |

兩份指引本身篇幅很短，可能正常。

### 已檢視並排除：藥名候選少不代表解析失敗

Basal Cell Skin Cancer（3%）、Wilms Tumor（6%）、Pediatric Soft Tissue Sarcoma（8%）、Melanoma: Uveal（9%）、Squamous Cell Skin Cancer（12%）的含藥名選項比例偏低。

這些癌別以**手術與放射治療為主**（BCC 為 Mohs 手術、葡萄膜黑色素瘤為敷貼近接治療或眼球摘除），藥名少是臨床事實而非解析缺陷，列出僅供追蹤。

## 逐檔明細

欄位說明：**有情境** = 已綁定臨床情境標題的選項數；**含藥名** = 標籤含藥物字尾的選項數；**需核對** = 解析器自行標記為 `needsReview` 的選項數。

| 指引 | 版本 | 頁數 | 治療頁 | 選項 | 有情境 | 含藥名 | 需核對 | 狀態 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Acute Lymphoblastic leukemia | 1.2026 | 170 | 37 | 311 | 156 | 190 | 73 | parsed |
| Ampullary Adenocarcinoma | 2.2026 | 81 | 20 | 157 | 124 | 87 | 31 | parsed |
| Anal carcinoma | 2.2026 | 69 | 14 | 89 | 24 | 47 | 33 | parsed |
| Appendiceal Neoplasms and Cancers | 2.2026 | 76 | 20 | 221 | 54 | 166 | 32 | parsed |
| B-Cell Lymphomas | 4.2026 | 369 | 62 | 321 | 147 | 98 | 107 | parsed |
| Basal Cell Skin Cancer | 2.2026 | 59 | 12 | 80 | 49 | 2 | 58 | parsed |
| Biliary Tract Cancers | 1.2026 | 108 | 23 | 241 | 177 | 53 | 127 | parsed |
| Bladder Cancer | 2.2026 | 142 | 37 | 213 | 89 | 80 | 79 | parsed |
| Bone Cancer | 2.2026 | 115 | 25 | 177 | 115 | 50 | 68 | parsed |
| Breast Cancer | 5.2026 | 278 | 62 | 575 | 235 | 155 | 200 | parsed |
| Castleman Disease | 2.2026 | 35 | 3 | 11 | 2 | 9 | 3 | parsed |
| Central Nervous System Cancers | 2.2026 | 246 | 81 | 643 | 241 | 228 | 147 | parsed |
| Cervical Cancer | 2.2026 | 138 | 28 | 222 | 87 | 100 | 61 | parsed |
| Chronic Lymphocytic Leukemia_SLL | 2.2026 | 118 | 11 | 50 | 22 | 24 | 17 | parsed |
| Chronic Myeloid Leukemia | 2.2027 | 118 | 15 | 111 | 14 | 37 | 60 | parsed |
| colon cancer | 2.2026 | 249 | 36 | 419 | 145 | 247 | 73 | parsed |
| Cutaneous Lymphomas | 2.2026 | 148 | 26 | 153 | 80 | 67 | 29 | parsed |
| dfsp | 2.2026 | 23 | 6 | 10 | 7 | 0 | 6 | parsed |
| Esophageal and EGJ Cancers | 3.2026 | 172 | 45 | 300 | 117 | 103 | 77 | parsed |
| Gastric Cancer | 3.2026 | 140 | 33 | 174 | 65 | 54 | 61 | parsed |
| Gastrointestinal Stromal Tumors | 1.2026 | 54 | 9 | 107 | 56 | 52 | 23 | parsed |
| Gestational Trophoblastic Neoplasia | 2.2026 | 56 | 17 | 101 | 33 | 56 | 29 | parsed |
| Hairy Cell Leukemia | 2.2026 | 32 | 4 | 33 | 15 | 18 | 17 | parsed |
| Hepatobiliary Cancers | - | 1 | 0 | 0 | 0 | 0 | 0 | redirect_notice |
| Hepatocellular Carcinoma | 1.2026 | 115 | 12 | 104 | 55 | 30 | 45 | parsed |
| Histiocytic Neoplasms | 1.2026 | 92 | 26 | 208 | 107 | 89 | 65 | parsed |
| Hodgkin Lymphoma | 2.2026 | 124 | 32 | 179 | 62 | 40 | 56 | parsed |
| Kaposi Sarcoma | 2.2026 | 52 | 11 | 116 | 54 | 31 | 39 | parsed |
| Kidney Cancer | 1.2027 | 100 | 20 | 169 | 104 | 57 | 60 | parsed |
| Melanoma_Cutaneous | 2.2026 | 260 | 77 | 573 | 133 | 154 | 246 | parsed |
| Melanoma_Uveal | 2.2026 | 96 | 11 | 57 | 11 | 5 | 27 | parsed |
| Merkel Cell Carcinoma | 2.2026 | 72 | 13 | 87 | 54 | 32 | 14 | parsed |
| Mesothelioma_Peritoneal | 2.2026 | 42 | 3 | 28 | 13 | 17 | 3 | parsed |
| Mesothelioma_Pleural | 3.2026 | 58 | 5 | 30 | 18 | 11 | 11 | parsed |
| MLN with Eosinophilia and TK Fusions | 1.2026 | 51 | 5 | 34 | 18 | 19 | 11 | parsed |
| Multiple Myeloma | 5.2026 | 141 | 22 | 188 | 29 | 53 | 40 | parsed |
| Myelodysplastic Syndromes | 3.2026 | 123 | 13 | 55 | 1 | 18 | 26 | parsed |
| Myeloproliferative Neoplasms | 2.2026 | 125 | 10 | 40 | 7 | 12 | 23 | parsed |
| Neuroblastoma | 2.2026 | 93 | 33 | 251 | 17 | 38 | 134 | parsed |
| Neuroendocrine and Adrenal Tumors | 1.2026 | 237 | 62 | 363 | 229 | 67 | 154 | parsed |
| Non-Small Cell Lung Cancer | 6.2026 | 302 | 52 | 407 | 237 | 212 | 79 | parsed |
| Occult Primary | 2.2026 | 86 | 23 | 173 | 58 | 111 | 23 | parsed |
| Ovarian_Fallopian_Primary Peritoneal | 4.2026 | 130 | 48 | 463 | 253 | 228 | 111 | parsed |
| Pancreatic Adenocarcinoma | 2.2026 | 171 | 32 | 260 | 208 | 118 | 70 | parsed |
| Pediatric Acute Lymphoblastic Leukemia | 1.2026 | 172 | 32 | 256 | 55 | 111 | 49 | parsed |
| Pediatric Aggressive Mature B-Cell Lymphomas | 1.2026 | 90 | 27 | 136 | 28 | 74 | 25 | parsed |
| Pediatric Central Nervous System Cancers | 1.2026 | 89 | 26 | 154 | 86 | 34 | 73 | parsed |
| Pediatric Hodgkin Lymphoma | 1.2026 | 86 | 19 | 136 | 36 | 31 | 18 | parsed |
| Pediatric Soft Tissue Sarcoma | 1.2026 | 51 | 25 | 145 | 44 | 12 | 53 | parsed |
| Penile Cancer | 2.2026 | 59 | 17 | 116 | 55 | 23 | 43 | parsed |
| Prostate Cancer | 5.2026 | 219 | 57 | 347 | 61 | 83 | 119 | parsed |
| Rectal Cancer | 2.2026 | 166 | 45 | 482 | 153 | 215 | 101 | parsed |
| Small Bowel Adenocarcinoma | 2.2026 | 68 | 15 | 136 | 46 | 85 | 43 | parsed |
| Small Cell Lung Cancer | 1.2027 | 93 | 15 | 78 | 34 | 17 | 22 | parsed |
| Soft tissue sarcoma | 4.2026 | 144 | 38 | 319 | 164 | 117 | 86 | parsed |
| Squamous Cell Skin Cancer | 2.2026 | 103 | 19 | 138 | 80 | 16 | 76 | parsed |
| Systemic Light Chain Amyloidosis | 2.2026 | 42 | 6 | 55 | 14 | 13 | 14 | parsed |
| Systemic Mastocytosis | 3.2026 | 82 | 12 | 29 | 11 | 4 | 13 | parsed |
| T-Cell Lymphomas | 2.2026 | 209 | 28 | 162 | 94 | 60 | 47 | parsed |
| Testicular Cancer | 2.2026 | 95 | 25 | 154 | 39 | 28 | 34 | parsed |
| Thymomas and Thymic Carcinomas | 2.2026 | 56 | 8 | 44 | 33 | 18 | 16 | parsed |
| Uterine Neoplasms | 3.2026 | 151 | 32 | 244 | 128 | 111 | 38 | parsed |
| Vaginal Cancer | 2.2026 | 67 | 16 | 90 | 33 | 42 | 22 | parsed |
| Vulvar Cancer | 2.2026 | 88 | 30 | 171 | 82 | 29 | 87 | parsed |
| Waldenstrom Macroglobulinemia_LPL | 2.2026 | 40 | 5 | 59 | 0 | 35 | 18 | parsed |
| Wilms Tumor (Nephroblastoma) | 1.2026 | 90 | 27 | 118 | 57 | 7 | 88 | parsed |
| **合計（65 份 parsed）** | | **7726** | **1660** | **12073** | **5055** | **4430** | **3733** | |

## 重跑方式

**公司電腦（有 Node）**

```bash
npm run audit:nccn-all
```

**沒有 Node 的機器**：用瀏覽器跑。先把 PDF 複製到 repo 下的 `_local-pdfs/`（已 gitignore，屬版權素材，用完請刪除），啟動靜態伺服器後在主控台載入 `NCCN_PARSER.extractAndParse()` 逐份解析並彙總。注意 Service Worker 對模組採 cache-first，改過解析器要先 `caches.delete()` 再重載。

## 臨床正確性怎麼核對

機械指標無法判斷抽出來的療程是否適用於該情境，這一段需要臨床判斷。建議做法（不必逐頁看）：

1. 匯入該份 PDF
2. 到對應癌別輸入一組熟悉的典型病患條件
3. 檢查排在前面的頁面與候選療程是否合理
4. 點「p.N →」跳到原文核對該頁確實是對應的治療頁

對不上時記錄「哪一份、哪個情境、預期看到什麼」，即可針對性地追解析結果。

## 已知限制

- 比對為頁面層級加上選項情境；情境標題未涵蓋的選項仍可能被套用到不完全相符的病患情境
- 驅動基因互斥規則目前涵蓋 EGFR / ALK / ROS1 / BRAF / RET / MET / KRAS / NTRK / NRG1
- ALK 情境會排到 subsequent-therapy 頁而非 first-line 頁，因該頁未帶 first-line 關鍵字
- 多欄版面以 24pt 間距切欄（依實測片段間距雙峰分佈選定），極端排版仍可能有跨欄殘留
