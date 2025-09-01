// apps/web/src/components/common/WelcomeScreen.tsx
import React from 'react';
import { MessageCircle, Users, Zap, Shield } from 'lucide-react';

export default function WelcomeScreen() {
  const features = [
    {
      icon: MessageCircle,
      title: 'Real-time Messaging',
      description: 'Send and receive messages instantly with Socket.io'
    },
    {
      icon: Users,
      title: 'Group Chats',
      description: 'Create group conversations with multiple participants'
    },
    {
      icon: Zap,
      title: 'Fast & Reliable',
      description: 'Built with modern technologies for optimal performance'
    },
    {
      icon: Shield,
      title: 'Secure & Private',
      description: 'Your conversations are protected with enterprise-grade security'
    }
  ];

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="max-w-md mx-auto text-center px-6">
        {/* Logo/Icon */}
        <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <MessageCircle className="w-10 h-10 text-white" />
        </div>

        {/* Welcome Message */}
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Welcome to ChatVerse
        </h1>
        <p className="text-gray-600 mb-8">
          Start a conversation by selecting a chat from the sidebar or create a new one.
        </p>

        {/* Features Grid */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="bg-white p-4 rounded-lg border border-gray-200 text-center"
              >
                <Icon className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  {feature.title}
                </h3>
                <p className="text-xs text-gray-500">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Tip */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-700">
            <span className="font-semibold">Tip:</span> Use the search bar to find contacts
            and start new conversations quickly.
          </p>
        </div>
      </div>
    </div>
  );
}
