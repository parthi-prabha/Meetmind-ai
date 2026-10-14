import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import OverviewPage from './pages/OverviewPage';
import AnalyzePage from './pages/AnalyzePage';
import DecisionsPage from './pages/DecisionsPage';
import TrackerPage from './pages/TrackerPage';
import AskPage from './pages/AskPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="analyze" element={<AnalyzePage />} />
          <Route path="decisions" element={<DecisionsPage />} />
          <Route path="tracker" element={<TrackerPage />} />
          <Route path="ask" element={<AskPage />} />
          {/* Fallback for undefined routes within the layout */}
          <Route path="*" element={<OverviewPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
