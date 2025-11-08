import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import VideoList from './pages/VideoList';
import VideoCreator from './pages/VideoCreator';
import VideoDetails from './pages/VideoDetails';
import ImageList from './pages/ImageList';
import ImageDetails from './pages/ImageDetails';
import AudioList from './pages/AudioList';
import ScriptGenerator from './pages/ScriptGenerator';
import Layout from './components/Layout';

const App: React.FC = () => {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<VideoList />} />
          <Route path="/create" element={<VideoCreator />} />
          <Route path="/generate-script" element={<ScriptGenerator />} />
          <Route path="/video/:videoId" element={<VideoDetails />} />
          <Route path="/images" element={<ImageList />} />
          <Route path="/image/:imageId" element={<ImageDetails />} />
          <Route path="/audios" element={<AudioList />} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App; 