// apps/web/src/app/layouts/MainLayout.tsx
import { Outlet } from 'react-router-dom';
import { useSocket } from '../providers/SocketProvider';
import Sidebar from '../../components/common/Sidebar';
import Header from '../../components/common/Header';
import { ConnectionStatus } from '../../components/common/ConnectionStatus';

export default function MainLayout() {
  const { isConnected } = useSocket();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        {/* Connection status */}
        {!isConnected && <ConnectionStatus />}

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
