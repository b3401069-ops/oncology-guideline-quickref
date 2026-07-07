import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from '@/components/Layout';
import HomePage from '@/features/search/HomePage';
import CancerDetailPage from '@/features/cancer-card/CancerDetailPage';
import QuickReferencePage from '@/features/quick-reference/QuickReferencePage';
import PdfLibraryPage from '@/features/pdf-library/PdfLibraryPage';
import ImportPdfPage from '@/features/pdf-library/ImportPdfPage';
import EditCancerPage from '@/features/cancer-card/EditCancerPage';
import ChecklistEditPage from '@/features/checklist/ChecklistEditPage';
import PrecisionFieldEditPage from '@/features/precision-fields/PrecisionFieldEditPage';
import NhiNoteEditPage from '@/features/settings/NhiNoteEditPage';
import SettingsPage from '@/features/settings/SettingsPage';

export default function App() {
  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 2500,
          style: {
            borderRadius: '12px',
            padding: '12px 16px',
            fontSize: '14px',
          },
        }}
      />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/cancer/:cancerId" element={<CancerDetailPage />} />
          <Route path="/cancer/:cancerId/quickref" element={<QuickReferencePage />} />
          <Route path="/cancer/:cancerId/edit" element={<EditCancerPage />} />
          <Route path="/cancer/:cancerId/checklist" element={<ChecklistEditPage />} />
          <Route path="/cancer/:cancerId/precision" element={<PrecisionFieldEditPage />} />
          <Route path="/cancer/:cancerId/nhi" element={<NhiNoteEditPage />} />
          <Route path="/pdf-library" element={<PdfLibraryPage />} />
          <Route path="/pdf-library/import" element={<ImportPdfPage />} />
          <Route path="/pdf-library/import/:docId" element={<ImportPdfPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
