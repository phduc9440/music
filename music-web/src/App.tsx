import { RouterProvider } from 'react-router-dom';
import 'react-toastify/dist/ReactToastify.css';

import I18nProvider from './i18n/I18nProvider';
import router from './routes/AppRoutes';
import ThemeProvider from './theme/ThemeProvider';

function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </ThemeProvider>
  );
}

export default App;
