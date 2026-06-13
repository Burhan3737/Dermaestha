// @ts-check
import { VideoRoom } from './views/VideoRoom/VideoRoom.jsx';
import { WaitingRoom } from './views/WaitingRoom/WaitingRoom.jsx';
import { Login } from '../auth/views/Login/Login.jsx';

/** Video module routes (D3). Unauthenticated users fall back to Login (mirrors the prior App.jsx). */
export const videoRoutes = (session) => [
  { path: '/video/:id/ready', element: session ? <WaitingRoom /> : <Login /> },
  { path: '/video/:id', element: session ? <VideoRoom /> : <Login /> },
];
