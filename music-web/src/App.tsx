import { BrowserRouter as Router } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import AppRoutes from './routes/AppRoutes';
import DialogProvider from './components/ui/DialogProvider';

function App() {
  return (
    <Router>
      <DialogProvider>
        <AppRoutes />
      </DialogProvider>
      <ToastContainer theme="dark" position="bottom-right" />
    </Router>
  );
}

export default App;
