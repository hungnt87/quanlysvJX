import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { routes } from '@/configs/routes.config';
import DashboardLayout from './DashboardLayout';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      {
        path: '',
        element: <Navigate to="/dashboard" replace />,
      },
      ...routes.map((route) => ({
        path: route.path,
        element: (
          <React.Suspense fallback={null}>
            <route.component />
          </React.Suspense>
        ),
      })),
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]);

export default router;
