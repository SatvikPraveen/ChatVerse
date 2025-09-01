// apps/web/src/app/routes/ChatRoute.tsx
import { Routes, Route, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useSocket } from '../providers/SocketProvider';
import ChatView from '../../components/chat/ChatView';
import WelcomeScreen from '../../components/common/WelcomeScreen';

function ChatConversation() {
  const { conversationId } = useParams();
  const { joinConversation, leaveConversation } = useSocket();

  useEffect(() => {
    if (conversationId) {
      joinConversation(conversationId);
      return () => leaveConversation(conversationId);
    }
  }, [conversationId, joinConversation, leaveConversation]);

  if (!conversationId) {
    return <WelcomeScreen />;
  }

  return <ChatView conversationId={conversationId} />;
}

export default function ChatRoute() {
  return (
    <Routes>
      <Route index element={<WelcomeScreen />} />
      <Route path=":conversationId" element={<ChatConversation />} />
    </Routes>
  );
}
