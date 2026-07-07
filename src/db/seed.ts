import { db } from './database';
import type { CancerRouteCard } from '@/models/types';
import { v4 as uuid } from 'uuid';

interface CancerTemplate {
  zhName: string;
  enName: string;
  synonyms?: string[];
}

const categories: Record<string, CancerTemplate[]> = {
  '消化系癌症': [
    { zhName: '食道癌', enName: 'Esophageal cancer', synonyms: ['esophageal carcinoma', '食道鱗狀細胞癌', '食道腺癌'] },
    { zhName: '胃癌', enName: 'Gastric cancer', synonyms: ['stomach cancer', 'gastric carcinoma'] },
    { zhName: '小腸癌', enName: 'Small bowel cancer', synonyms: ['small intestinal cancer', 'duodenal cancer'] },
    { zhName: '大腸直腸癌', enName: 'Colorectal cancer', synonyms: ['CRC', 'colon cancer', 'rectal cancer', '結腸癌', '直腸癌'] },
    { zhName: '肛門癌', enName: 'Anal cancer', synonyms: ['anal carcinoma', 'anal canal cancer'] },
    { zhName: '胰臟癌', enName: 'Pancreatic cancer', synonyms: ['pancreatic carcinoma', '胰腺癌'] },
    { zhName: '膽道癌', enName: 'Biliary tract cancer', synonyms: ['cholangiocarcinoma', 'gallbladder cancer', '肝內膽管癌', '肝外膽管癌', '膽囊癌'] },
    { zhName: '肝癌', enName: 'Hepatocellular carcinoma', synonyms: ['HCC', 'hepatocellular cancer', '肝細胞癌', 'hepatic cancer'] },
    { zhName: '胃腸道基質瘤', enName: 'Gastrointestinal stromal tumor', synonyms: ['GIST'] },
    { zhName: '神經內分泌腫瘤', enName: 'Neuroendocrine tumor', synonyms: ['NET', 'neuroendocrine neoplasm', 'NEN'] },
  ],
  '胸腔癌症': [
    { zhName: '非小細胞肺癌', enName: 'Non-small cell lung cancer', synonyms: ['NSCLC', '非小细胞肺癌'] },
    { zhName: '小細胞肺癌', enName: 'Small cell lung cancer', synonyms: ['SCLC', '小细胞肺癌'] },
    { zhName: '胸腺腫瘤', enName: 'Thymic tumor', synonyms: ['thymoma', 'thymic carcinoma', '胸腺癌'] },
    { zhName: '間皮瘤', enName: 'Mesothelioma', synonyms: ['malignant mesothelioma', 'pleural mesothelioma'] },
  ],
  '乳癌': [
    { zhName: '乳癌', enName: 'Breast cancer', synonyms: ['breast carcinoma', '乳腺癌'] },
  ],
  '婦癌': [
    { zhName: '卵巢癌', enName: 'Ovarian cancer', synonyms: ['ovarian carcinoma'] },
    { zhName: '輸卵管癌', enName: 'Fallopian tube cancer', synonyms: ['tubal cancer'] },
    { zhName: '原發性腹膜癌', enName: 'Primary peritoneal cancer', synonyms: ['peritoneal carcinoma'] },
    { zhName: '子宮內膜癌', enName: 'Endometrial cancer', synonyms: ['uterine cancer', '子宫内膜癌', 'endometrial carcinoma'] },
    { zhName: '子宮頸癌', enName: 'Cervical cancer', synonyms: ['cervical carcinoma', '宫颈癌', '子宫颈癌'] },
    { zhName: '外陰癌', enName: 'Vulvar cancer', synonyms: ['vulvar carcinoma'] },
    { zhName: '陰道癌', enName: 'Vaginal cancer', synonyms: ['vaginal carcinoma'] },
    { zhName: '妊娠滋養細胞疾病', enName: 'Gestational trophoblastic disease', synonyms: ['GTD', 'gestational trophoblastic neoplasia', 'GTN', '絨毛膜癌', '葡萄胎'] },
  ],
  '泌尿系癌症': [
    { zhName: '腎細胞癌', enName: 'Renal cell carcinoma', synonyms: ['RCC', 'kidney cancer', '肾癌', 'renal cancer'] },
    { zhName: '膀胱癌', enName: 'Bladder cancer', synonyms: ['bladder carcinoma', 'urothelial carcinoma'] },
    { zhName: '攝護腺癌', enName: 'Prostate cancer', synonyms: ['prostate carcinoma', '前列腺癌'] },
    { zhName: '睪丸癌', enName: 'Testicular cancer', synonyms: ['testicular carcinoma', 'testicular germ cell tumor'] },
    { zhName: '陰莖癌', enName: 'Penile cancer', synonyms: ['penile carcinoma'] },
    { zhName: '腎盂輸尿管癌', enName: 'Renal pelvis and ureter cancer', synonyms: ['upper tract urothelial carcinoma', 'UTUC'] },
  ],
  '頭頸癌': [
    { zhName: '口腔癌', enName: 'Oral cavity cancer', synonyms: ['oral cancer', 'oral carcinoma'] },
    { zhName: '口咽癌', enName: 'Oropharyngeal cancer', synonyms: ['oropharynx cancer'] },
    { zhName: '下咽癌', enName: 'Hypopharyngeal cancer', synonyms: ['hypopharynx cancer'] },
    { zhName: '喉癌', enName: 'Laryngeal cancer', synonyms: ['larynx cancer', '喉頭癌'] },
    { zhName: '鼻咽癌', enName: 'Nasopharyngeal cancer', synonyms: ['NPC', 'nasopharynx cancer'] },
    { zhName: '唾液腺癌', enName: 'Salivary gland cancer', synonyms: ['salivary gland carcinoma', '涎腺癌'] },
    { zhName: '甲狀腺癌', enName: 'Thyroid cancer', synonyms: ['thyroid carcinoma', '甲状腺癌', 'papillary thyroid', 'follicular thyroid'] },
  ],
  '皮膚與黑色素細胞癌': [
    { zhName: '黑色素瘤', enName: 'Melanoma', synonyms: ['malignant melanoma', '惡性黑色素瘤'] },
    { zhName: '非黑色素皮膚癌', enName: 'Non-melanoma skin cancer', synonyms: ['NMSC', 'basal cell carcinoma', 'squamous cell skin carcinoma', 'BCC', 'cSCC', '基底細胞癌', '鱗狀細胞癌'] },
    { zhName: 'Merkel 細胞癌', enName: 'Merkel cell carcinoma', synonyms: ['MCC', 'Merkel cell carcinoma'] },
  ],
  '骨與軟組織腫瘤': [
    { zhName: '軟組織肉瘤', enName: 'Soft tissue sarcoma', synonyms: ['STS', 'sarcoma', '肉瘤'] },
    { zhName: '骨肉瘤', enName: 'Osteosarcoma', synonyms: ['osteogenic sarcoma'] },
    { zhName: '尤文氏肉瘤', enName: 'Ewing sarcoma', synonyms: ["Ewing's sarcoma", 'Ewing tumor'] },
  ],
  '中樞神經系統腫瘤': [
    { zhName: '腦部腫瘤', enName: 'Brain tumor', synonyms: ['brain cancer', 'glioma', 'glioblastoma', 'GBM', '腦瘤', '神經膠質瘤'] },
    { zhName: '脊髓腫瘤', enName: 'Spinal cord tumor', synonyms: ['spinal tumor', 'spinal cord neoplasm'] },
    { zhName: '腦轉移指引入口', enName: 'Brain metastasis', synonyms: ['brain mets', 'CNS metastasis', '腦轉移'] },
  ],
  '血液腫瘤': [
    { zhName: '淋巴瘤', enName: 'Lymphoma', synonyms: ['Hodgkin lymphoma', 'non-Hodgkin lymphoma', 'HL', 'NHL', '霍奇金淋巴瘤', '非霍奇金淋巴瘤'] },
    { zhName: '多發性骨髓瘤', enName: 'Multiple myeloma', synonyms: ['MM', 'plasma cell myeloma', '骨髓瘤'] },
    { zhName: '慢性淋巴性白血病', enName: 'Chronic lymphocytic leukemia', synonyms: ['CLL', '慢性淋巴细胞白血病'] },
    { zhName: '骨髓增生不良症候群', enName: 'Myelodysplastic syndromes', synonyms: ['MDS', '骨髓增生异常综合征'] },
    { zhName: '骨髓增生性腫瘤', enName: 'Myeloproliferative neoplasms', synonyms: ['MPN', 'CML', 'PV', 'ET', 'PMF', '骨髓增殖性肿瘤'] },
  ],
  '內分泌與神經內分泌腫瘤': [
    { zhName: '副腎腫瘤', enName: 'Adrenal tumor', synonyms: ['adrenal carcinoma', 'adrenocortical carcinoma', 'pheochromocytoma', '肾上腺肿瘤'] },
  ],
  '其他': [
    { zhName: '原發不明癌', enName: 'Cancer of unknown primary', synonyms: ['CUP', 'unknown primary', '原发不明恶性肿瘤'] },
    { zhName: '罕見癌症', enName: 'Rare cancers', synonyms: ['rare tumor', 'orphan cancer'] },
    { zhName: '其他未分類腫瘤', enName: 'Other unclassified tumors', synonyms: [] },
  ],
};

export async function seedDatabase() {
  const count = await db.cancerCards.count();
  if (count > 0) {
    return; // Already seeded
  }

  const cards: CancerRouteCard[] = [];

  for (const [category, cancers] of Object.entries(categories)) {
    for (const cancer of cancers) {
      cards.push({
        id: generateId(cancer.zhName),
        category,
        zhName: cancer.zhName,
        enName: cancer.enName,
        synonyms: cancer.synonyms || [],
        primaryGuideline: '',
        secondaryGuidelines: [],
        documentIds: [],
        mustReadSections: [],
        checklistIds: [],
        precisionFieldIds: [],
        nhiNoteIds: [],
        externalLinks: [],
        reviewStatus: '待維護',
        updatedAt: new Date().toISOString().split('T')[0],
      });
    }
  }

  await db.cancerCards.bulkAdd(cards);
  console.log(`Seeded ${cards.length} cancer cards`);
}

function generateId(zhName: string): string {
  // Create a stable ID from the Chinese name
  const map: Record<string, string> = {
    '食道癌': 'esophageal_cancer',
    '胃癌': 'gastric_cancer',
    '小腸癌': 'small_bowel_cancer',
    '大腸直腸癌': 'colorectal_cancer',
    '肛門癌': 'anal_cancer',
    '胰臟癌': 'pancreatic_cancer',
    '膽道癌': 'biliary_tract_cancer',
    '肝癌': 'hepatocellular_carcinoma',
    '胃腸道基質瘤': 'gist',
    '神經內分泌腫瘤': 'neuroendocrine_tumor',
    '非小細胞肺癌': 'nsclc',
    '小細胞肺癌': 'sclc',
    '胸腺腫瘤': 'thymic_tumor',
    '間皮瘤': 'mesothelioma',
    '乳癌': 'breast_cancer',
    '卵巢癌': 'ovarian_cancer',
    '輸卵管癌': 'fallopian_tube_cancer',
    '原發性腹膜癌': 'primary_peritoneal_cancer',
    '子宮內膜癌': 'endometrial_cancer',
    '子宮頸癌': 'cervical_cancer',
    '外陰癌': 'vulvar_cancer',
    '陰道癌': 'vaginal_cancer',
    '妊娠滋養細胞疾病': 'gestational_trophoblastic_disease',
    '腎細胞癌': 'renal_cell_carcinoma',
    '膀胱癌': 'bladder_cancer',
    '攝護腺癌': 'prostate_cancer',
    '睪丸癌': 'testicular_cancer',
    '陰莖癌': 'penile_cancer',
    '腎盂輸尿管癌': 'renal_pelvis_ureter_cancer',
    '口腔癌': 'oral_cavity_cancer',
    '口咽癌': 'oropharyngeal_cancer',
    '下咽癌': 'hypopharyngeal_cancer',
    '喉癌': 'laryngeal_cancer',
    '鼻咽癌': 'nasopharyngeal_cancer',
    '唾液腺癌': 'salivary_gland_cancer',
    '甲狀腺癌': 'thyroid_cancer',
    '黑色素瘤': 'melanoma',
    '非黑色素皮膚癌': 'non_melanoma_skin_cancer',
    'Merkel 細胞癌': 'merkel_cell_carcinoma',
    '軟組織肉瘤': 'soft_tissue_sarcoma',
    '骨肉瘤': 'osteosarcoma',
    '尤文氏肉瘤': 'ewing_sarcoma',
    '腦部腫瘤': 'brain_tumor',
    '脊髓腫瘤': 'spinal_cord_tumor',
    '腦轉移指引入口': 'brain_metastasis',
    '淋巴瘤': 'lymphoma',
    '多發性骨髓瘤': 'multiple_myeloma',
    '慢性淋巴性白血病': 'cll',
    '骨髓增生不良症候群': 'mds',
    '骨髓增生性腫瘤': 'mpn',
    '副腎腫瘤': 'adrenal_tumor',
    '原發不明癌': 'cancer_unknown_primary',
    '罕見癌症': 'rare_cancers',
    '其他未分類腫瘤': 'other_unclassified',
  };
  return map[zhName] || uuid();
}
