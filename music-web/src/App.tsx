import { RouterProvider } from 'react-router-dom';
import 'react-toastify/dist/ReactToastify.css';

import router from './routes/AppRoutes';
import ThemeProvider from './theme/ThemeProvider';

function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}

export default App;
