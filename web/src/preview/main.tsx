import './configure';
import { PREVIEW_DATA_MODE } from './configure';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import PreviewApp from './PreviewApp';
import { isPreviewReadOnly } from '../lib/apiPublic';
import { installPreviewReadOnlyGuard } from './readOnly';
import '../index.css';

installPreviewReadOnlyGuard();
document.documentElement.dataset.previewReadonly = 'true';
document.documentElement.dataset.previewApiReadonly = String(isPreviewReadOnly());
document.documentElement.dataset.previewDataMode = PREVIEW_DATA_MODE;
document.documentElement.dataset.previewBuildMode = import.meta.env.PROD ? 'production' : 'development';

const host = document.getElementById('root');
if (!host) throw new Error('missing #root');

createRoot(host).render(
  <StrictMode>
    <BrowserRouter>
      <PreviewApp />
    </BrowserRouter>
  </StrictMode>,
);
