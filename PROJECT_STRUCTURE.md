.
├── .editorconfig
├── .env.example
├── .github
│   └── workflows
│       ├── ci.yml
│       ├── release.yml
│       └── security-scan.yml
├── .gitignore
├── .vscode
│   ├── extensions.json
│   └── settings.json
├── apps
│   ├── api
│   │   ├── .env.example
│   │   ├── jest.config.js
│   │   ├── package.json
│   │   ├── package.test.json
│   │   ├── src
│   │   │   ├── config
│   │   │   │   ├── constants.ts
│   │   │   │   └── env.ts
│   │   │   ├── controllers
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── conversations.controller.ts
│   │   │   │   ├── messages.controller.ts
│   │   │   │   ├── push.controller.ts
│   │   │   │   ├── uploads.controller.ts
│   │   │   │   └── users.controller.ts
│   │   │   ├── db
│   │   │   │   ├── mongo.ts
│   │   │   │   └── redis.ts
│   │   │   ├── health
│   │   │   │   ├── liveness.ts
│   │   │   │   └── readiness.ts
│   │   │   ├── index.ts
│   │   │   ├── middlewares
│   │   │   │   ├── auth.ts
│   │   │   │   ├── error.ts
│   │   │   │   ├── rateLimit.ts
│   │   │   │   ├── security.ts
│   │   │   │   └── validation.ts
│   │   │   ├── models
│   │   │   │   ├── Conversation.ts
│   │   │   │   ├── Message.ts
│   │   │   │   ├── PushSubscription.ts
│   │   │   │   └── User.ts
│   │   │   ├── realtime
│   │   │   │   ├── events.chat.ts
│   │   │   │   ├── events.presence.ts
│   │   │   │   ├── io.ts
│   │   │   │   └── rateLimiter.socket.ts
│   │   │   ├── routes
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── conversations.routes.ts
│   │   │   │   ├── messages.routes.ts
│   │   │   │   ├── push.routes.ts
│   │   │   │   ├── uploads.routes.ts
│   │   │   │   └── users.routes.ts
│   │   │   ├── server.ts
│   │   │   ├── services
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── conversation.service.ts
│   │   │   │   ├── message.service.ts
│   │   │   │   ├── push.service.ts
│   │   │   │   ├── upload.service.ts
│   │   │   │   └── user.service.ts
│   │   │   ├── telemetry
│   │   │   │   ├── metrics.ts
│   │   │   │   └── tracing.ts
│   │   │   ├── tests
│   │   │   │   ├── e2e
│   │   │   │   │   └── chat-flow.e2e.test.ts
│   │   │   │   ├── integration
│   │   │   │   │   ├── auth.integration.test.ts
│   │   │   │   │   └── messages.integration.test.ts
│   │   │   │   ├── setup.ts
│   │   │   │   └── unit
│   │   │   │       ├── auth.service.test.ts
│   │   │   │       └── message.service.test.ts
│   │   │   └── utils
│   │   │       ├── crypto.ts
│   │   │       ├── logger.ts
│   │   │       └── pagination.ts
│   │   └── tsconfig.json
│   └── web
│       ├── .env.example
│       ├── index.html
│       ├── package.json
│       ├── public
│       │   ├── favicon.ico
│       │   ├── manifest.json
│       │   └── robots.txt
│       ├── src
│       │   ├── app
│       │   │   ├── layouts
│       │   │   │   ├── AuthLayout.tsx
│       │   │   │   └── MainLayout.tsx
│       │   │   ├── providers
│       │   │   │   ├── AuthProvider.tsx
│       │   │   │   └── SocketProvider.tsx
│       │   │   └── routes
│       │   │       ├── ChatRoute.tsx
│       │   │       ├── LoginRoute.tsx
│       │   │       ├── RegisterRoute.tsx
│       │   │       └── SettingsRoute.tsx
│       │   ├── App.tsx
│       │   ├── assets
│       │   │   ├── chat.svg
│       │   │   ├── logo.svg
│       │   │   └── send.svg
│       │   ├── components
│       │   │   ├── chat
│       │   │   │   ├── ChatView.tsx
│       │   │   │   ├── Composer.tsx
│       │   │   │   ├── MessageAttachments.tsx
│       │   │   │   ├── MessageItem.tsx
│       │   │   │   ├── MessageList.tsx
│       │   │   │   └── TypingIndicator.tsx
│       │   │   ├── common
│       │   │   │   ├── Avatar.tsx
│       │   │   │   ├── Button.tsx
│       │   │   │   ├── ConnectionStatus.tsx
│       │   │   │   ├── EmojiPicker.tsx
│       │   │   │   ├── Header.tsx
│       │   │   │   ├── Input.tsx
│       │   │   │   ├── LoadingSpinner.tsx
│       │   │   │   ├── Sidebar.tsx
│       │   │   │   ├── Toaster.tsx
│       │   │   │   └── WelcomeScreen.tsx
│       │   │   └── upload
│       │   │       └── AttachmentPreview.tsx
│       │   ├── hooks
│       │   │   ├── useAuth.ts
│       │   │   └── useUpload.ts
│       │   ├── main.tsx
│       │   ├── services
│       │   │   ├── apiClient.ts
│       │   │   ├── push.ts
│       │   │   ├── s3.ts
│       │   │   └── socket.ts
│       │   ├── store
│       │   │   ├── authStore.ts
│       │   │   └── chatStore.ts
│       │   ├── styles
│       │   │   └── index.css
│       │   ├── sw.ts
│       │   ├── utils
│       │   │   └── cn.ts
│       │   └── vite-env.d.ts
│       ├── tailwind.config.js
│       ├── tsconfig.json
│       └── vite.config.ts
├── docs
│   ├── API_REFERENCE.md
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── README.md
│   ├── RUNBOOKS
│   │   ├── incidents.md
│   │   └── scaling.md
│   └── SECURITY.md
├── generate-chatverse-structure.sh
├── infra
│   ├── docker
│   │   ├── api.Dockerfile
│   │   ├── docker-compose.dev.yml
│   │   ├── nginx.conf
│   │   └── web.Dockerfile
│   ├── k8s
│   │   ├── api-deployment.yaml
│   │   ├── hpa.yaml
│   │   ├── ingress.yaml
│   │   ├── namespace.yaml
│   │   ├── secrets.yaml
│   │   └── web-deployment.yaml
│   └── terraform
│       └── aws
│           ├── main.tf
│           └── variables.tf
├── package.json
├── packages
│   ├── eslint-config
│   │   ├── index.js
│   │   └── package.json
│   ├── types
│   │   ├── package.json
│   │   ├── src
│   │   │   ├── api.ts
│   │   │   ├── models.ts
│   │   │   └── socket.ts
│   │   └── tsconfig.json
│   └── ui
│       ├── package.json
│       ├── src
│       │   ├── Avatar.tsx
│       │   ├── Badge.tsx
│       │   ├── Buttons.tsx
│       │   ├── Card.tsx
│       │   ├── index.ts
│       │   ├── Input.tsx
│       │   ├── Modal.tsx
│       │   ├── Spinner.tsx
│       │   └── Tooltip.tsx
│       └── tsconfig.json
├── pnpm-workspace.yaml
├── PROJECT_STRUCTURE.md
├── README.md
├── scripts
│   ├── dev.sh
│   ├── migrate.mjs
│   └── seed.mjs
└── tsconfig.base.json

53 directories, 160 files
