# Drafty - League of Legends Scrim Manager

A web application for organizing League of Legends scrims, managing player queues, and running fearless draft sessions.

## Features

- **Authentication**: Sign in with Google or email/password
- **Riot Account Connection**: Link your League accounts to display rank and stats
- **Scrim Scheduling**: Plan matches and manage rosters
- **Player Queue**: Find players for upcoming matches
- **Fearless Draft**: Run competitive drafts with cumulative bans across a best-of series

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI**: shadcn/ui + Tailwind CSS
- **Backend**: Firebase (Auth, Firestore, Cloud Functions)
- **Routing**: React Router v6

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Firebase CLI (`npm install -g firebase-tools`)
- A Firebase project

### Setup

1. Clone the repository

2. Install dependencies:
   ```bash
   npm install
   cd functions && npm install
   ```

3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Add your Firebase config to `.env`:
   ```
   VITE_FIREBASE_API_KEY=your-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   ```

5. Update `.firebaserc` with your Firebase project ID

6. Start the development server:
   ```bash
   npm run dev
   ```

### Firebase Emulators (Optional)

For local development without hitting production Firebase:

1. Set `VITE_USE_EMULATORS=true` in your `.env`

2. Start the emulators:
   ```bash
   firebase emulators:start
   ```

### Cloud Functions

The `functions/` directory contains Firebase Cloud Functions for:
- Riot API integration (secure API key handling)
- Account verification and rank fetching

To configure the Riot API key for production:
```bash
firebase functions:secrets:set RIOT_API_KEY
```

## Project Structure

```
drafty/
├── src/
│   ├── components/       # UI components
│   │   └── ui/          # shadcn components
│   ├── contexts/        # React contexts (Auth)
│   ├── hooks/           # Custom hooks
│   ├── lib/             # Firebase config, utilities
│   ├── pages/           # Route pages
│   └── types/           # TypeScript types
├── functions/           # Firebase Cloud Functions
├── firebase.json        # Firebase config
└── firestore.rules      # Firestore security rules
```

## Available Scripts

### Frontend

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Functions

- `cd functions && npm run build` - Build functions
- `cd functions && npm run serve` - Start functions emulator

## License

MIT
