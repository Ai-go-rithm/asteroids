import React from 'react';
import AsteroidsGame from './components/AsteroidsGame';

const App: React.FC = () => {
  return (
    <div className="w-full h-screen bg-black text-white flex items-center justify-center overflow-hidden">
      <AsteroidsGame />
    </div>
  );
};

export default App;