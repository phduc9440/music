import { BrowserRouter as Router } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import AppRoutes from './routes/AppRoutes';
import DialogProvider from './components/ui/DialogProvider';
import ThemeProvider from './theme/ThemeProvider';
import { useTheme } from './theme/useTheme';

/** Thông báo nổi đi theo theme đang dùng (trước đây luôn tối). */
function Toasts() {
  const { resolved } = useTheme();
  return <ToastContainer theme={resolved} position="bottom-right" />;
}

function App() {
  return (
    <ThemeProvider>
      <Router>
        <DialogProvider>
          <AppRoutes />
        </DialogProvider>
        <Toasts />
      </Router>
    </ThemeProvider>
  );
}

export default App;
