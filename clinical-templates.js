(() => {
  'use strict';

  const cl = (key, label, category = '檢測', importance = '必查', scope = 'cancer') =>
    ({ key, label, category, importance, scope });
  const pf = (key, label, type = 'single_select', options = [], scope = 'cancer', metadata = {}) =>
    ({ key, label, type, options, required: false, scope, ...metadata });

  // These templates identify information to verify or record. They do not choose treatment.
  const commonChecklists = [
    cl('base-pathology', '確認病理診斷、組織型與分級', '確認', '必查', 'common'),
    cl('base-stage', '完成分期與基準影像，記錄可切除性／疾病範圍', '評估', '必查', 'common'),
    cl('base-specimen', '確認檢體適足，並保留分子檢測所需材料', '確認', '必查', 'common'),
    cl('base-biomarker', '確認本癌別、病期與治療線別所需的生物標記', '檢測', '必查', 'common'),
    cl('base-fitness', '確認 ECOG、共病與肝腎心功能', '評估', '必查', 'common'),
    cl('base-nhi', '治療前比對最新指引、健保給付與事前審查條件', '確認', '必查', 'common'),
    cl('base-infection', '全身治療前確認 HBV／HCV 等感染風險與預防需求', '檢測', '建議', 'common'),
    cl('base-hereditary', '評估胚系遺傳檢測與遺傳諮詢適應情境', '評估', '建議', 'common'),
    cl('base-support', '評估支持照護、生育保存與臨床試驗', '處置', '建議', 'common'),
  ];

  const commonPrecisionFields = [
    pf('base-disease-setting', '病程情境', 'single_select', ['初診局限','局部晚期／不可切除','復發','轉移／全身性','治療後追蹤'], 'common'),
    pf('base-stage', '臨床／病理分期或風險分層', 'text', [], 'common'),
    pf('base-ecog', 'ECOG PS', 'single_select', ['0','1','2','3','4'], 'common'),
    pf('base-treatment-setting', '治療階段／線別', 'single_select', ['尚未治療','術前／誘導','術後／鞏固','第一線','第二線','第三線以上','維持治療','追蹤'], 'common'),
    pf('base-pathology', '病理診斷與亞型', 'text', [], 'common'),
    pf('base-biomarker-summary', '分子／生物標記摘要', 'text', [], 'common'),
    pf('base-specimen-date', '檢體來源與檢測日期', 'text', [], 'common'),
  ];

  const legacyAliases = {
    checklists: {
      'base-pathology': ['確認病理診斷與亞型'],
      'base-stage': ['完成分期影像檢查'],
      'base-biomarker': ['確認生物標記／基因檢測狀態'],
      'base-fitness': ['評估體能狀態（ECOG PS）','評估器官功能（肝、腎、心）'],
      'base-nhi': ['比對健保給付條件與事前審查需求'],
      'base-infection': ['B、C 型肝炎篩檢（全身治療前）'],
      'base-support': ['生育保存諮詢（適齡病人）','評估臨床試驗可行性'],
    },
    precisionFields: {
      'base-disease-setting': ['疾病狀態'],
      'base-stage': ['分期'],
      'base-treatment-setting': ['治療線數'],
      'base-pathology': ['病理亞型'],
      'base-biomarker-summary': ['生物標記'],
    },
  };
  for (const item of commonChecklists) item.aliases = legacyAliases.checklists[item.key] || [];
  for (const item of commonPrecisionFields) item.aliases = legacyAliases.precisionFields[item.key] || [];

  const groups = [
    {
      ids: ['nsclc'],
      checklists: [
        cl('nsclc-tissue', '確認肺癌組織型與檢體腫瘤量，必要時規劃再切片／液態切片'),
        cl('nsclc-ngs', '晚期／復發 NSCLC：確認完整 DNA＋RNA 分子檢測，不只單驗 EGFR'),
        cl('nsclc-pdl1', '晚期／復發 NSCLC：記錄 PD-L1 檢測平台與 TPS 原始數值'),
        cl('nsclc-brain', '完成腦部 MRI（依分期與臨床情境）', '評估'),
      ],
      precisionFields: [
        pf('nsclc-histology', 'NSCLC 組織型', 'single_select', ['腺癌','鱗狀細胞癌','大細胞／其他','NSCLC NOS','待確認']),
        pf('nsclc-drivers', 'NSCLC 驅動基因／可標靶變異', 'multi_select', ['EGFR sensitizing','EGFR exon 20 insertion','ALK fusion','ROS1 fusion','BRAF V600E','KRAS G12C','MET exon 14 skipping','MET amplification','RET fusion','NTRK1/2/3 fusion','ERBB2（HER2）mutation','NRG1 fusion','無已知可標靶變異','待檢']),
        pf('nsclc-pdl1-assay', 'PD-L1 檢測平台／clone', 'text'),
        pf('nsclc-pdl1-tps', 'PD-L1 TPS（%）', 'number'),
        pf('nsclc-brain-mets', '腦轉移', 'single_select', ['無','有','待確認']),
        pf('nsclc-molecular-specimen', '分子檢測檢體', 'single_select', ['組織','血液 ctDNA','組織＋血液','待檢']),
      ],
    },
    {
      ids: ['sclc'],
      checklists: [
        cl('sclc-stage', '確認侷限期／廣泛期分期與放療範圍', '評估'),
        cl('sclc-brain', '完成腦部 MRI 與後續 CNS 監測規劃', '評估'),
      ],
      precisionFields: [
        pf('sclc-stage', 'SCLC 分期', 'single_select', ['侷限期','廣泛期','待確認']),
        pf('sclc-brain-mets', '腦轉移', 'single_select', ['無','有','待確認']),
      ],
    },
    {
      ids: ['breast_cancer'],
      checklists: [
        cl('breast-core-markers', '完整記錄 ER、PR、HER2 IHC／ISH 原始結果與檢測日期'),
        cl('breast-rebiopsy', '復發／轉移時評估重新切片並更新 ER、PR、HER2'),
        cl('breast-germline', '依年齡、家族史、亞型與病期評估胚系多基因檢測'),
        cl('breast-advanced-markers', '晚期乳癌依亞型／治療線別確認 PIK3CA、ESR1、AKT1／PTEN、BRCA1/2／PALB2'),
        cl('breast-tnbc-pdl1', '晚期三陰性乳癌：確認 PD-L1 檢測平台與 CPS（依治療情境）'),
      ],
      precisionFields: [
        pf('breast-er', 'ER', 'single_select', ['陽性','低度陽性（1–10%）','陰性','待檢']),
        pf('breast-pr', 'PR', 'single_select', ['陽性','陰性','待檢']),
        pf('breast-her2', 'HER2 原始結果', 'single_select', ['IHC 0','IHC 1+','IHC 2+／ISH 陰性','IHC 2+／ISH 陽性','IHC 3+','待檢']),
        pf('breast-subtype', '乳癌臨床亞型', 'single_select', ['HR+/HER2-','HER2+','三陰性','待確認']),
        pf('breast-pdl1-cps', 'PD-L1 CPS（晚期 TNBC）', 'number'),
        pf('breast-advanced-alterations', '晚期乳癌相關分子變異', 'multi_select', ['PIK3CA','ESR1','AKT1','PTEN loss／alteration','BRCA1','BRCA2','PALB2','MSI-H／dMMR','TMB-High','NTRK fusion','無已知相關變異','待檢']),
        pf('breast-germline', '胚系遺傳檢測', 'single_select', ['未評估','不符合／暫不需','已送檢待報告','陽性','陰性','VUS']),
      ],
    },
    {
      ids: ['colorectal_cancer','colon_cancer','rectal_cancer'],
      checklists: [
        cl('crc-mmr', '確認 MMR IHC 或 MSI 結果；MLH1/PMS2 缺失時完成必要的散發性／遺傳性評估'),
        cl('crc-ras-braf', '轉移性大腸直腸癌：確認 KRAS／NRAS 與 BRAF V600E'),
        cl('crc-extended', '轉移性／後線情境：依需要確認 HER2、KRAS G12C、NTRK 等可作用標記'),
        cl('crc-sidedness', '記錄原發位置（右側／左側／直腸）與所有轉移部位', '確認'),
        cl('crc-rectal-mri', '直腸癌：確認骨盆 MRI、CRM／EMVI 與全身分期', '評估'),
      ],
      precisionFields: [
        pf('crc-primary-site', '大腸直腸原發位置', 'single_select', ['右側結腸','左側結腸','直腸','多發／不明']),
        pf('crc-mmr-msi', 'MMR／MSI', 'single_select', ['pMMR／MSS','dMMR／MSI-H','結果不一致／待釐清','待檢']),
        pf('crc-ras', 'RAS', 'single_select', ['KRAS／NRAS wild type','KRAS mutation','NRAS mutation','待檢']),
        pf('crc-braf', 'BRAF', 'single_select', ['V600E','non-V600 alteration','wild type','待檢']),
        pf('crc-extended-markers', 'CRC 其他可作用標記', 'multi_select', ['HER2 amplification／overexpression','KRAS G12C','NTRK fusion','POLE／POLD1 pathogenic alteration','無','待檢']),
        pf('crc-metastatic-sites', '轉移部位', 'multi_select', ['肝','肺','腹膜','非區域淋巴結','骨','腦','其他','無']),
      ],
    },
    {
      ids: ['gastric_cancer','esophageal_cancer'],
      checklists: [
        cl('uppergi-histology', '確認原發位置與鱗癌／腺癌病理亞型', '確認'),
        cl('uppergi-core-biomarkers', '晚期胃／胃食道交界腺癌：確認 HER2、MMR／MSI、PD-L1 CPS、CLDN18.2'),
        cl('uppergi-ngs', '晚期疾病依可用檢體與治療情境評估廣泛 NGS'),
      ],
      precisionFields: [
        pf('uppergi-site-histology', '上消化道原發／病理', 'single_select', ['食道鱗狀細胞癌','食道腺癌','胃食道交界腺癌','胃腺癌','其他／待確認']),
        pf('uppergi-her2', 'HER2', 'single_select', ['陽性','陰性','待檢／不適用']),
        pf('uppergi-mmr', 'MMR／MSI', 'single_select', ['pMMR／MSS','dMMR／MSI-H','待檢']),
        pf('uppergi-pdl1-cps', 'PD-L1 CPS', 'number'),
        pf('uppergi-cldn18', 'CLDN18.2', 'single_select', ['陽性','陰性','待檢／不適用']),
        pf('uppergi-ebv', 'EBV 腫瘤狀態', 'single_select', ['陽性','陰性','待檢／不適用']),
      ],
    },
    {
      ids: ['small_bowel_cancer'],
      checklists: [
        cl('smallbowel-mmr', '確認 MMR／MSI 與 Lynch syndrome 評估'),
        cl('smallbowel-advanced', '晚期小腸腺癌依治療情境評估 RAS、BRAF、HER2、NTRK 等分子檢測'),
      ],
      precisionFields: [
        pf('smallbowel-site', '小腸原發位置', 'single_select', ['十二指腸','空腸','迴腸','不明']),
        pf('smallbowel-mmr', 'MMR／MSI', 'single_select', ['pMMR／MSS','dMMR／MSI-H','待檢']),
        pf('smallbowel-molecular', '小腸癌分子標記', 'multi_select', ['KRAS／NRAS alteration','BRAF alteration','HER2 amplification','NTRK fusion','無／待檢']),
      ],
    },
    {
      ids: ['pancreatic_cancer'],
      checklists: [
        cl('pancreas-resectability', '多專科確認可切除性與血管侵犯', '評估'),
        cl('pancreas-germline', '安排胚系多基因檢測並記錄遺傳諮詢結果'),
        cl('pancreas-somatic', '晚期胰臟癌：確認腫瘤分子檢測／NGS 與 MSI／MMR'),
      ],
      precisionFields: [
        pf('pancreas-resectability', '胰臟癌可切除性', 'single_select', ['可切除','邊緣可切除','局部晚期不可切除','轉移','待確認']),
        pf('pancreas-germline', '胰臟癌胚系檢測', 'single_select', ['未送檢','待報告','陽性','陰性','VUS']),
        pf('pancreas-alterations', '胰臟癌相關分子變異', 'multi_select', ['BRCA1','BRCA2','PALB2','MSI-H／dMMR','NTRK fusion','NRG1 fusion','BRAF V600E','KRAS G12C','HER2 amplification','無已知可作用變異','待檢']),
      ],
    },
    {
      ids: ['biliary_tract_cancer','hepatobiliary_cancers'],
      checklists: [
        cl('biliary-site', '確認肝內／肝外膽管或膽囊原發位置與可切除性', '確認'),
        cl('biliary-ngs', '不可切除／轉移性膽道癌：安排足量 DNA＋RNA NGS'),
        cl('biliary-markers', '確認 FGFR2、IDH1、HER2、BRAF、MSI／MMR、NTRK 等可作用標記'),
      ],
      precisionFields: [
        pf('biliary-site', '膽道癌原發位置', 'single_select', ['肝內膽管','肝門部膽管','遠端膽管','膽囊','其他／待確認']),
        pf('biliary-alterations', '膽道癌相關分子變異', 'multi_select', ['FGFR2 fusion／rearrangement','IDH1 mutation','HER2 amplification／overexpression','BRAF V600E','MSI-H／dMMR','NTRK fusion','RET fusion','KRAS G12C','無已知可作用變異','待檢']),
      ],
    },
    {
      ids: ['hepatocellular_carcinoma'],
      checklists: [
        cl('hcc-liver-function', '確認 Child-Pugh、ALBI、門脈高壓與失代償狀態', '評估'),
        cl('hcc-stage', '完成 BCLC 分期並記錄門靜脈侵犯／肝外轉移', '評估'),
        cl('hcc-viral', '確認 HBV／HCV 狀態與抗病毒治療需求'),
      ],
      precisionFields: [
        pf('hcc-bclc', 'BCLC 分期', 'single_select', ['0','A','B','C','D','待確認']),
        pf('hcc-child-pugh', 'Child-Pugh', 'single_select', ['A5','A6','B7','B8','B9','C','待確認'], 'cancer', {
          help: 'A 級＝5–6 分；B 級＝7–9 分；C 級＝10–15 分。',
          optionLabels: {
            A5: 'A5（A 級，5 分）',
            A6: 'A6（A 級，6 分）',
            B7: 'B7（B 級，7 分）',
            B8: 'B8（B 級，8 分）',
            B9: 'B9（B 級，9 分）',
            C: 'C（C 級，10–15 分）',
          },
        }),
        pf('hcc-albi', 'ALBI grade', 'single_select', ['1','2','3','待確認']),
        pf('hcc-macrovascular', '大血管侵犯', 'single_select', ['無','有','待確認']),
        pf('hcc-afp', 'AFP（ng/mL）', 'number'),
        pf('hcc-viral-status', '肝炎狀態', 'multi_select', ['HBsAg+','anti-HBc+','HCV RNA+','無已知病毒性肝炎','待確認']),
      ],
    },
    {
      ids: ['gist'],
      checklists: [
        cl('gist-pathology', '確認 DOG1／KIT 病理支持、原發位置與有絲分裂率'),
        cl('gist-genotype', '治療決策前確認 KIT／PDGFRA 基因型；wild type 時擴充 SDH 等評估'),
      ],
      precisionFields: [
        pf('gist-site', 'GIST 原發位置', 'single_select', ['胃','小腸','結直腸','食道','腸繫膜／腹膜','其他']),
        pf('gist-molecular', 'GIST 分子亞型', 'multi_select', ['KIT exon 11','KIT exon 9','KIT exon 13／17','PDGFRA D842V','其他 PDGFRA','SDH-deficient','NF1-associated','BRAF alteration','NTRK fusion','wild type／待進一步檢測']),
        pf('gist-mitotic-rate', '有絲分裂率／風險分層', 'text'),
      ],
    },
    {
      ids: ['neuroendocrine_tumor','neuroendocrine_adrenal_tumors'],
      checklists: [
        cl('net-grade', '確認分化程度、Ki-67 與 grade；區分 NET／NEC'),
        cl('net-functional', '確認功能性症候群與相關生化檢查', '評估'),
        cl('net-sstr', '依分化與治療情境確認 SSTR 影像／表現狀態', '評估'),
      ],
      precisionFields: [
        pf('net-primary', '神經內分泌腫瘤原發位置', 'text'),
        pf('net-differentiation', '分化／分類', 'single_select', ['well-differentiated NET','poorly differentiated NEC','MiNEN／混合型','待確認']),
        pf('net-grade', 'NET grade', 'single_select', ['G1','G2','G3','不適用／待確認']),
        pf('net-ki67', 'Ki-67（%）', 'number'),
        pf('net-sstr', 'SSTR 狀態', 'single_select', ['陽性','陰性','待檢／不適用']),
        pf('net-functional', '功能性症候群', 'single_select', ['無','有','待確認']),
      ],
    },
    {
      ids: ['ovarian_cancer','fallopian_tube_cancer','primary_peritoneal_cancer','ovarian_fallopian_peritoneal_cancers'],
      checklists: [
        cl('ovarian-histology', '確認卵巢／輸卵管／腹膜癌組織型與分級'),
        cl('ovarian-germline', '新診斷上皮性卵巢癌：評估胚系多基因檢測與遺傳諮詢'),
        cl('ovarian-somatic', '確認腫瘤 BRCA1/2 與 HRD；依組織型／病期評估 MMR／MSI'),
        cl('ovarian-fralpha', '復發／晚期情境：依治療線別確認 FRα（FOLR1）檢測需求'),
      ],
      precisionFields: [
        pf('ovarian-histology', '卵巢癌組織型', 'single_select', ['high-grade serous','low-grade serous','endometrioid','clear cell','mucinous','其他／待確認']),
        pf('ovarian-germline-brca', '胚系 BRCA／遺傳檢測', 'single_select', ['未送檢','待報告','陽性','陰性','VUS']),
        pf('ovarian-somatic-brca', '腫瘤 BRCA1/2', 'single_select', ['pathogenic alteration','未檢出','待檢']),
        pf('ovarian-hrd', 'HRD', 'single_select', ['陽性','陰性','無法判讀','待檢']),
        pf('ovarian-fralpha', 'FRα（FOLR1）', 'single_select', ['陽性','陰性','待檢／不適用']),
        pf('ovarian-mmr', 'MMR／MSI', 'single_select', ['pMMR／MSS','dMMR／MSI-H','待檢／不適用']),
      ],
    },
    {
      ids: ['endometrial_cancer','uterine_neoplasms'],
      checklists: [
        cl('endometrial-molecular', '完成子宮內膜癌分子分類所需的 MMR、p53 與 POLE 評估'),
        cl('endometrial-mlh1', 'MLH1／PMS2 缺失時確認 MLH1 promoter methylation 與遺傳評估'),
        cl('endometrial-her2', '漿液性癌／癌肉瘤等適用情境確認 HER2'),
      ],
      precisionFields: [
        pf('endometrial-histology', '子宮內膜癌組織型', 'text'),
        pf('endometrial-molecular-class', '子宮內膜癌分子分類', 'single_select', ['POLEmut','MMRd','p53abn','NSMP','待確認']),
        pf('endometrial-mmr', 'MMR IHC／MSI', 'single_select', ['intact／MSS','loss／MSI-H','待檢']),
        pf('endometrial-mlh1', 'MLH1 promoter methylation', 'single_select', ['methylated','unmethylated','待檢／不適用']),
        pf('endometrial-her2', 'HER2（適用組織型）', 'single_select', ['陽性','陰性','待檢／不適用']),
        pf('endometrial-er', 'ER', 'single_select', ['陽性','陰性','待檢／不適用']),
      ],
    },
    {
      ids: ['cervical_cancer'],
      checklists: [
        cl('cervix-pathology', '確認鱗癌／腺癌等組織型與 HPV 相關性'),
        cl('cervix-pdl1', '持續、復發或轉移性子宮頸癌：記錄 PD-L1 平台與 CPS'),
        cl('cervix-tumor-agnostic', '晚期／後線情境依需要確認 MMR／MSI、TMB、NTRK'),
      ],
      precisionFields: [
        pf('cervix-histology', '子宮頸癌組織型', 'single_select', ['鱗狀細胞癌','腺癌','腺鱗癌','神經內分泌癌','其他']),
        pf('cervix-pdl1-cps', 'PD-L1 CPS', 'number'),
        pf('cervix-molecular', '子宮頸癌其他分子標記', 'multi_select', ['MSI-H／dMMR','TMB-High','NTRK fusion','HER2 alteration','無','待檢']),
      ],
    },
    {
      ids: ['renal_cell_carcinoma'],
      checklists: [
        cl('rcc-histology', '確認腎細胞癌組織型、grade 與 sarcomatoid／rhabdoid 成分'),
        cl('rcc-imdc', '轉移性 RCC：記錄 IMDC 風險因子與分層', '評估'),
        cl('rcc-hereditary', '依年齡、雙側／多發、組織型與家族史評估遺傳性腎癌'),
      ],
      precisionFields: [
        pf('rcc-histology', 'RCC 組織型', 'single_select', ['clear cell','papillary','chromophobe','collecting duct／medullary','其他／未分類']),
        pf('rcc-imdc', 'IMDC risk', 'single_select', ['favorable','intermediate','poor','待確認／不適用']),
        pf('rcc-sarcomatoid', 'Sarcomatoid component', 'single_select', ['無','有','待確認']),
        pf('rcc-hereditary', '遺傳性腎癌評估', 'single_select', ['不需／未達條件','建議轉介','已送檢待報告','陽性','陰性']),
      ],
    },
    {
      ids: ['bladder_cancer','renal_pelvis_ureter_cancer'],
      checklists: [
        cl('urothelial-stage', '確認肌層侵犯、原發位置與變異組織型', '確認'),
        cl('urothelial-fgfr', '局部晚期／轉移性尿路上皮癌：依治療線別確認 FGFR2／3 變異'),
        cl('urothelial-pdl1', '需要免疫治療選擇時，確認適用的 PD-L1 assay／score 與臨床情境'),
      ],
      precisionFields: [
        pf('urothelial-site', '尿路上皮癌原發位置', 'single_select', ['膀胱','腎盂','輸尿管','尿道','多發／不明']),
        pf('urothelial-muscle', '膀胱肌層侵犯', 'single_select', ['NMIBC','MIBC','不適用／待確認']),
        pf('urothelial-fgfr', 'FGFR2／3 alteration', 'single_select', ['陽性','陰性','待檢／不適用']),
        pf('urothelial-pdl1', 'PD-L1 assay／score', 'text'),
      ],
    },
    {
      ids: ['prostate_cancer'],
      checklists: [
        cl('prostate-state', '確認轉移狀態與去勢敏感／去勢抗性疾病情境', '評估'),
        cl('prostate-germline', '依病期、家族史與病理特徵安排胚系遺傳檢測'),
        cl('prostate-somatic', '轉移性攝護腺癌：確認腫瘤／ctDNA 的 HRR、MMR／MSI 等檢測'),
        cl('prostate-psma', '依治療情境確認 PSMA 影像與放射配體治療資格資料', '評估'),
      ],
      precisionFields: [
        pf('prostate-state', '攝護腺癌疾病狀態', 'single_select', ['局限性','生化復發','mHSPC／mCSPC','nmCRPC','mCRPC','待確認']),
        pf('prostate-grade', 'Grade Group／Gleason', 'text'),
        pf('prostate-hrr', 'HRR／DNA repair 基因', 'multi_select', ['BRCA1','BRCA2','ATM','PALB2','CHEK2','CDK12','其他 HRR','未檢出','待檢']),
        pf('prostate-mmr', 'MMR／MSI／TMB', 'multi_select', ['dMMR／MSI-H','TMB-High','pMMR／MSS','待檢']),
        pf('prostate-germline', '胚系檢測', 'single_select', ['未評估','待報告','陽性','陰性','VUS']),
        pf('prostate-psma', 'PSMA 影像', 'single_select', ['陽性','陰性／低表現','未做／不適用']),
      ],
    },
    {
      ids: ['testicular_cancer'],
      checklists: [
        cl('testis-markers', '治療前與睪丸切除後記錄 AFP、β-hCG、LDH 趨勢'),
        cl('testis-risk', '轉移性生殖細胞瘤：完成 IGCCCG 風險分層', '評估'),
      ],
      precisionFields: [
        pf('testis-histology', '睪丸腫瘤組織型', 'single_select', ['seminoma','nonseminoma／mixed GCT','其他／待確認']),
        pf('testis-afp', 'AFP', 'number'),
        pf('testis-bhcg', 'β-hCG', 'number'),
        pf('testis-ldh', 'LDH', 'number'),
        pf('testis-igcccg', 'IGCCCG risk', 'single_select', ['good','intermediate','poor','不適用／待確認']),
      ],
    },
    {
      ids: ['oral_cavity_cancer','oropharyngeal_cancer','hypopharyngeal_cancer','laryngeal_cancer','head_neck_cancers'],
      checklists: [
        cl('hn-site', '確認頭頸原發部位、組織型與菸酒／檳榔風險', '確認'),
        cl('hn-pdl1', '復發／轉移性頭頸鱗癌：確認 PD-L1 平台與 CPS'),
        cl('hn-dental-nutrition', '放化療前完成牙科、吞嚥、營養與氣道評估', '評估'),
      ],
      precisionFields: [
        pf('hn-primary-site', '頭頸癌原發部位', 'text'),
        pf('hn-pdl1-cps', 'PD-L1 CPS', 'number'),
        pf('hn-smoking', '吸菸史（pack-years）', 'number'),
      ],
    },
    {
      ids: ['oropharyngeal_cancer'],
      checklists: [cl('oropharynx-hpv', '口咽鱗癌：確認 p16 IHC／HPV 狀態並使用相符分期')],
      precisionFields: [pf('oropharynx-hpv', '口咽癌 p16／HPV', 'single_select', ['p16 positive／HPV-associated','p16 negative／HPV-independent','待檢'])],
    },
    {
      ids: ['nasopharyngeal_cancer'],
      checklists: [
        cl('npc-ebv', '非角化型鼻咽癌：記錄 EBER 與血漿 EBV DNA 基準值／趨勢'),
        cl('npc-mri', '完成鼻咽／顱底 MRI 與遠端分期', '評估'),
      ],
      precisionFields: [
        pf('npc-ebv', 'EBER', 'single_select', ['陽性','陰性','待檢']),
        pf('npc-ebv-dna', '血漿 EBV DNA', 'number'),
        pf('npc-pdl1-cps', 'PD-L1 CPS（復發／轉移情境）', 'number'),
      ],
    },
    {
      ids: ['salivary_gland_cancer'],
      checklists: [cl('salivary-markers', '晚期唾液腺癌依組織型確認 AR、HER2、NTRK／RET 等可作用標記')],
      precisionFields: [pf('salivary-markers', '唾液腺癌相關標記', 'multi_select', ['AR positive','HER2 positive／amplified','NTRK fusion','RET fusion','MSI-H／TMB-High','無','待檢'])],
    },
    {
      ids: ['thyroid_cancer'],
      checklists: [
        cl('thyroid-histology', '確認分化型／髓質型／未分化型甲狀腺癌與碘攝取狀態'),
        cl('thyroid-molecular', '進展／碘難治或未分化癌：依組織型確認 BRAF、RET、NTRK、RAS 等變異'),
        cl('thyroid-germline', '髓質型甲狀腺癌：確認胚系 RET 檢測與家族評估'),
      ],
      precisionFields: [
        pf('thyroid-histology', '甲狀腺癌組織型', 'single_select', ['papillary','follicular／oncocytic','poorly differentiated','anaplastic','medullary','其他']),
        pf('thyroid-rai', '放射碘狀態', 'single_select', ['尚未評估','可攝取／敏感','碘難治','不適用']),
        pf('thyroid-alterations', '甲狀腺癌分子變異', 'multi_select', ['BRAF V600E','RET fusion','germline RET','somatic RET','NTRK fusion','RAS mutation','TERT promoter','ALK fusion','無','待檢']),
      ],
    },
    {
      ids: ['melanoma'],
      checklists: [
        cl('melanoma-pathology', '確認 Breslow thickness、潰瘍、mitotic rate 與淋巴結分期'),
        cl('melanoma-braf', '不可切除／轉移性黑色素瘤：確認 BRAF V600'),
        cl('melanoma-expanded', '依原發部位與治療情境確認 KIT、NRAS、NTRK 等擴充檢測'),
        cl('melanoma-brain', '晚期疾病完成腦部 MRI', '評估'),
      ],
      precisionFields: [
        pf('melanoma-primary', '黑色素瘤原發類型', 'single_select', ['cutaneous','acral','mucosal','unknown primary','其他']),
        pf('melanoma-braf', 'BRAF', 'single_select', ['V600E／V600K','non-V600 alteration','wild type','待檢']),
        pf('melanoma-other', '黑色素瘤其他分子變異', 'multi_select', ['NRAS','KIT','NTRK fusion','無','待檢']),
        pf('melanoma-ldh', 'LDH', 'number'),
        pf('melanoma-brain', '腦轉移', 'single_select', ['無','有','待確認']),
      ],
    },
    {
      ids: ['uveal_melanoma'],
      checklists: [
        cl('uveal-risk', '確認葡萄膜黑色素瘤細胞遺傳／分子風險與肝轉移監測計畫'),
        cl('uveal-hla', '轉移性疾病：依治療情境確認 HLA-A*02:01'),
      ],
      precisionFields: [
        pf('uveal-molecular', '葡萄膜黑色素瘤分子風險', 'multi_select', ['GNAQ／GNA11','BAP1 loss／alteration','SF3B1','EIF1AX','monosomy 3','待檢']),
        pf('uveal-hla', 'HLA-A*02:01', 'single_select', ['陽性','陰性','待檢']),
        pf('uveal-liver-mets', '肝轉移', 'single_select', ['無','有','待確認']),
      ],
    },
    {
      ids: ['brain_tumor','spinal_cord_tumor','cns_cancers','pediatric_cns_cancers'],
      checklists: [
        cl('cns-integrated-diagnosis', '確認 WHO CNS 整合診斷，而非只記形態學名稱'),
        cl('cns-core-markers', '瀰漫性膠質瘤：確認 IDH、1p/19q、ATRX／TP53 與必要的分子分級標記'),
        cl('cns-mgmt', '高級別膠質瘤：確認 MGMT promoter methylation'),
        cl('cns-methylation', '診斷不明或兒童／罕見 CNS 腫瘤：評估 methylation profiling／融合檢測'),
      ],
      precisionFields: [
        pf('cns-integrated-diagnosis', 'WHO CNS 整合診斷', 'text'),
        pf('cns-idh', 'IDH', 'single_select', ['IDH-mutant','IDH-wildtype','待檢／不適用']),
        pf('cns-1p19q', '1p/19q codeletion', 'single_select', ['codeleted','intact','待檢／不適用']),
        pf('cns-mgmt', 'MGMT promoter methylation', 'single_select', ['methylated','unmethylated','indeterminate','待檢／不適用']),
        pf('cns-other-markers', 'CNS 其他關鍵標記', 'multi_select', ['ATRX loss','TP53 alteration','TERT promoter','EGFR amplification','chromosome 7 gain／10 loss','CDKN2A/B homozygous deletion','H3 K27-altered','H3 G34-mutant','BRAF V600E','BRAF fusion','NTRK fusion','待檢']),
        pf('cns-methylation-class', 'DNA methylation class', 'text'),
      ],
    },
    {
      ids: ['acute_myeloid_leukemia'],
      checklists: [
        cl('aml-rapid', '診斷時快速回報 PML::RARA、FLT3、NPM1 與核心融合／細胞遺傳結果'),
        cl('aml-panel', '完成 AML 分子 panel 與細胞遺傳風險分層'),
        cl('aml-mrd', '建立可追蹤的 MRD 標記與評估時間點', '評估'),
      ],
      precisionFields: [
        pf('aml-genetics', 'AML 關鍵分子／融合', 'multi_select', ['PML::RARA','RUNX1::RUNX1T1','CBFB::MYH11','KMT2A rearrangement','NPM1','FLT3-ITD／TKD','CEBPA bZIP','IDH1','IDH2','TP53','ASXL1／RUNX1 等 MR genes','其他／待檢']),
        pf('aml-cytogenetics', 'AML 細胞遺傳結果', 'text'),
        pf('aml-risk', 'AML 風險分層', 'single_select', ['favorable','intermediate','adverse','待確認']),
        pf('aml-mrd', 'AML MRD', 'single_select', ['陰性','陽性','不可評估／待檢']),
      ],
    },
    {
      ids: ['acute_lymphoblastic_leukemia','pediatric_all'],
      checklists: [
        cl('all-lineage', '確認 B-ALL／T-ALL lineage 與完整流式表型'),
        cl('all-genetics', '完成 BCR::ABL1、KMT2A 等融合／細胞遺傳與高風險亞型評估'),
        cl('all-mrd', '建立並依療程時間點追蹤 MRD', '評估'),
      ],
      precisionFields: [
        pf('all-lineage', 'ALL lineage', 'single_select', ['B-ALL','T-ALL','mixed phenotype／其他','待確認']),
        pf('all-genetics', 'ALL 關鍵遺傳標記', 'multi_select', ['BCR::ABL1','Ph-like／ABL-class fusion','KMT2A rearrangement','ETV6::RUNX1','TCF3::PBX1','hyperdiploidy','hypodiploidy','iAMP21','其他／待檢']),
        pf('all-mrd', 'ALL MRD', 'single_select', ['陰性','陽性','不可評估／待檢']),
      ],
    },
    {
      ids: ['chronic_myeloid_leukemia'],
      checklists: [
        cl('cml-baseline', '確認 BCR::ABL1 transcript type、基準 IS 值與疾病期別'),
        cl('cml-milestones', '依時間點追蹤 BCR::ABL1 IS 治療里程碑', '評估'),
        cl('cml-resistance', '未達里程碑／失去反應時評估 ABL1 kinase domain mutation'),
      ],
      precisionFields: [
        pf('cml-phase', 'CML phase', 'single_select', ['chronic phase','accelerated phase','blast phase','待確認']),
        pf('cml-transcript', 'BCR::ABL1 transcript', 'single_select', ['e13a2','e14a2','其他','待確認']),
        pf('cml-is', 'BCR::ABL1 IS（%）', 'number'),
        pf('cml-abl1', 'ABL1 kinase domain mutation', 'text'),
      ],
    },
    {
      ids: ['cll'],
      checklists: [
        cl('cll-tp53', '每次開始新療程前確認 del(17p)／TP53 mutation'),
        cl('cll-ighv', '首次治療前確認 IGHV mutation status'),
        cl('cll-fish', '完成 CLL FISH 與臨床風險分層'),
      ],
      precisionFields: [
        pf('cll-tp53', 'CLL TP53／del(17p)', 'single_select', ['異常','無異常','待檢']),
        pf('cll-ighv', 'IGHV', 'single_select', ['mutated','unmutated','待檢']),
        pf('cll-fish', 'CLL FISH', 'multi_select', ['del(17p)','del(11q)','trisomy 12','del(13q)','無上述異常','待檢']),
        pf('cll-stage', 'CLL stage', 'single_select', ['Rai 0','Rai I–II','Rai III–IV','Binet A','Binet B','Binet C','待確認']),
      ],
    },
    {
      ids: ['mds'],
      checklists: [
        cl('mds-cytogenetics', '完成骨髓形態、染色體與 MDS 分子 panel'),
        cl('mds-risk', '記錄 IPSS-R／IPSS-M 風險與輸血需求', '評估'),
      ],
      precisionFields: [
        pf('mds-cytogenetics', 'MDS 細胞遺傳結果', 'text'),
        pf('mds-mutations', 'MDS 關鍵分子變異', 'multi_select', ['TP53 multi-hit','SF3B1','ASXL1','RUNX1','EZH2','SRSF2','U2AF1','其他／待檢']),
        pf('mds-risk', 'MDS 風險分層', 'text'),
      ],
    },
    {
      ids: ['mpn'],
      checklists: [
        cl('mpn-driver', '確認 JAK2、CALR、MPL driver；必要時排除 BCR::ABL1'),
        cl('mpn-risk', '依 MPN 亞型完成血栓／存活風險分層', '評估'),
      ],
      precisionFields: [
        pf('mpn-subtype', 'MPN 亞型', 'single_select', ['PV','ET','PMF／pre-PMF','MPN-unclassifiable','待確認']),
        pf('mpn-driver', 'MPN driver', 'single_select', ['JAK2 V617F／exon 12','CALR','MPL','triple-negative','待檢']),
        pf('mpn-high-risk', 'MPN 其他高風險變異', 'multi_select', ['ASXL1','SRSF2','EZH2','IDH1／2','U2AF1','TP53','無／待檢']),
        pf('mpn-risk', 'MPN 風險分層', 'text'),
      ],
    },
    {
      ids: ['multiple_myeloma'],
      checklists: [
        cl('myeloma-baseline', '完成 SPEP／IFE、free light chain、骨髓與全身影像基準評估'),
        cl('myeloma-fish', 'CD138 富集骨髓完成高風險 FISH／細胞遺傳'),
        cl('myeloma-risk', '記錄 R-ISS／R2-ISS 與高風險特徵', '評估'),
        cl('myeloma-mrd', '適用情境建立 MRD 評估方法與時間點', '評估'),
      ],
      precisionFields: [
        pf('myeloma-isotype', '骨髓瘤 isotype', 'text'),
        pf('myeloma-fish', '骨髓瘤 FISH／高風險標記', 'multi_select', ['del(17p)／TP53','t(4;14)','t(14;16)','t(14;20)','1q gain／amplification','1p deletion','無上述異常','待檢']),
        pf('myeloma-risk', 'R-ISS／R2-ISS', 'text'),
        pf('myeloma-mrd', '骨髓瘤 MRD', 'single_select', ['陰性','陽性','未評估']),
      ],
    },
    {
      ids: ['lymphoma','b_cell_lymphomas','pediatric_aggressive_b_cell_lymphomas'],
      checklists: [
        cl('bcl-subtype', '完成淋巴瘤精確亞型、流式／IHC 與分期'),
        cl('bcl-fish', '侵襲性大 B 細胞淋巴瘤依形態／IHC 確認 MYC、BCL2、BCL6 FISH 需求'),
        cl('bcl-viral', '依亞型與治療確認 HBV、HCV、HIV、EBV 等感染評估'),
      ],
      precisionFields: [
        pf('bcl-subtype', 'B 細胞淋巴瘤亞型', 'text'),
        pf('bcl-markers', 'B 細胞淋巴瘤關鍵標記', 'multi_select', ['CD20','CD19','CD30','MYC rearrangement','BCL2 rearrangement','BCL6 rearrangement','MYD88 L265P','TP53 alteration','EBV positive','其他／待檢']),
        pf('bcl-stage', 'Lugano stage', 'single_select', ['I','II','III','IV','待確認']),
      ],
    },
    {
      ids: ['hodgkin_lymphoma','pediatric_hodgkin_lymphoma'],
      checklists: [
        cl('hl-baseline', '完成 Lugano 分期、B symptoms、bulky disease 與基準 PET/CT', '評估'),
        cl('hl-interim-pet', '依療程時點記錄 interim PET Deauville score', '評估'),
      ],
      precisionFields: [
        pf('hl-stage', 'Hodgkin lymphoma stage', 'single_select', ['I','II','III','IV','待確認']),
        pf('hl-b-symptoms', 'B symptoms', 'single_select', ['無','有','待確認']),
        pf('hl-bulky', 'Bulky disease', 'single_select', ['無','有','待確認']),
        pf('hl-deauville', 'Interim PET Deauville', 'single_select', ['1','2','3','4','5','未評估']),
      ],
    },
    {
      ids: ['soft_tissue_sarcoma','pediatric_soft_tissue_sarcoma'],
      checklists: [
        cl('sts-expert-path', '罕見／未分化肉瘤安排專科病理複核', '確認'),
        cl('sts-molecular', '依形態與部位安排融合／擴增等確認性分子檢測'),
        cl('sts-local-stage', '治療前記錄腫瘤大小、深度、筋膜／神經血管關係與肺部分期', '評估'),
      ],
      precisionFields: [
        pf('sts-histology', '軟組織肉瘤組織型', 'text'),
        pf('sts-molecular', '肉瘤關鍵分子結果', 'multi_select', ['MDM2 amplification','SS18 rearrangement','EWSR1 rearrangement','NTRK fusion','ALK alteration','其他融合／變異','無／待檢']),
        pf('sts-grade', 'FNCLCC grade／適用風險分層', 'text'),
      ],
    },
    {
      ids: ['myeloid_lymphoid_eosinophilia_tk_fusions'],
      checklists: [
        cl('mlne-fusion', '確認 PDGFRA、PDGFRB、FGFR1、JAK2、FLT3 或 ABL1 類融合／重排'),
      ],
      precisionFields: [
        pf('mlne-fusion', '酪胺酸激酶融合／重排', 'multi_select', ['PDGFRA','PDGFRB','FGFR1','JAK2','FLT3','ABL1-class fusion','其他／待確認']),
        pf('mlne-presentation', '疾病表現', 'single_select', ['chronic myeloid/lymphoid neoplasm','AML','ALL','mixed phenotype','待確認']),
      ],
    },
    {
      ids: ['systemic_al_amyloidosis'],
      checklists: [
        cl('al-organ', '確認受累器官、心臟分期與治療緊急性', '評估'),
        cl('al-clone', '確認漿細胞 clone、單株蛋白與相關骨髓檢查'),
      ],
      precisionFields: [
        pf('al-treatment-status', 'AL amyloidosis 治療時點', 'single_select', ['newly diagnosed／first-line','relapsed／previously treated','待確認']),
        pf('al-hct', '自體 HCT 適用性', 'single_select', ['eligible','not eligible','待確認']),
        pf('al-cardiac-stage', '心臟分期／風險', 'text'),
      ],
    },
    {
      ids: ['systemic_mastocytosis'],
      checklists: [
        cl('sm-subtype', '確認全身性肥大細胞增生症亞型與器官損害'),
        cl('sm-kit', '確認 KIT D816V 或其他 KIT 變異'),
      ],
      precisionFields: [
        pf('sm-subtype', 'Systemic mastocytosis 亞型', 'single_select', ['indolent','smoldering','aggressive systemic mastocytosis','mast cell leukemia','SM-AHN／associated hematologic neoplasm','待確認']),
        pf('sm-kit', 'KIT D816V', 'single_select', ['positive','negative','待檢']),
      ],
    },
    {
      ids: ['waldenstrom_macroglobulinemia'],
      checklists: [
        cl('wm-indication', '確認是否已有症狀或器官損害而需啟動治療', '評估'),
        cl('wm-molecular', '確認 MYD88 L265P 與適用情境下的 CXCR4'),
      ],
      precisionFields: [
        pf('wm-treatment-status', 'WM 治療時點', 'single_select', ['asymptomatic／observation','symptomatic／first-line','relapsed／previously treated','待確認']),
        pf('wm-myd88', 'MYD88', 'single_select', ['L265P positive','wild type','待檢']),
        pf('wm-cxcr4', 'CXCR4', 'single_select', ['mutation positive','wild type','待檢']),
      ],
    },
  ];

  const normalizeLabel = (value) => String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const unique = (items) => {
    const keys = new Set();
    const labels = new Set();
    return items.filter((item) => {
      const label = normalizeLabel(item.label);
      if (keys.has(item.key) || labels.has(label)) return false;
      keys.add(item.key);
      labels.add(label);
      return true;
    });
  };
  const templatesForCancer = (cancerId, field, common) => unique([
    ...common,
    ...groups.filter((group) => group.ids.includes(cancerId)).flatMap((group) => group[field] || []),
  ]);

  window.CLINICAL_TEMPLATES = Object.freeze({
    version: 3,
    commonChecklists,
    commonPrecisionFields,
    checklistForCancer: (cancerId) => templatesForCancer(cancerId, 'checklists', commonChecklists),
    precisionForCancer: (cancerId) => templatesForCancer(cancerId, 'precisionFields', commonPrecisionFields),
  });
})();
